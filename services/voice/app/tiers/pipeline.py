"""Tier 2 — STT (Deepgram) → LLM (Gemini Flash) → TTS (Cartesia) pipeline.

Falls back to the echo loop when keys or pipecat extras are missing.
"""

from __future__ import annotations

import structlog
from fastapi import WebSocket

from app.agent_runtime import build_system_prompt, cartesia_voice_id, pipeline_model, runtime_settings
from app.persistence import TranscriptBuffer
from app.settings import settings
from app.tiers._common import echo_until_close, fetch_agent_for_call

log = structlog.get_logger()


class PipelineTier:
    async def run(
        self,
        ws: WebSocket,
        *,
        call_id: str,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
    ) -> None:
        log.info("tier2.start", call_id=call_id, agent_id=agent_id)

        if not all((settings.deepgram_api_key, settings.gemini_api_key, settings.cartesia_api_key)):
            log.warning(
                "tier2.no_keys",
                hint="set DEEPGRAM_API_KEY + GEMINI_API_KEY + CARTESIA_API_KEY to enable Tier 2",
            )
            await echo_until_close(ws)
            return

        try:
            from pipecat.pipeline.pipeline import Pipeline  # type: ignore[import-not-found]
            from pipecat.pipeline.runner import PipelineRunner  # type: ignore[import-not-found]
            from pipecat.pipeline.task import PipelineTask  # type: ignore[import-not-found]
            from pipecat.processors.aggregators.openai_llm_context import (  # type: ignore[import-not-found]
                OpenAILLMContext,
            )
            from pipecat.services.cartesia import (  # type: ignore[import-not-found]
                CartesiaTTSService,
            )
            from pipecat.services.deepgram import (  # type: ignore[import-not-found]
                DeepgramSTTService,
            )
            from pipecat.services.google import GoogleLLMService  # type: ignore[import-not-found]
            from pipecat.transports.network.websocket_server import (  # type: ignore[import-not-found]
                FastAPIWebsocketParams,
                FastAPIWebsocketTransport,
            )
        except ImportError:
            log.warning(
                "tier2.pipecat_missing",
                hint="pip install -e '.[voice]' to enable real Pipecat pipelines",
            )
            await echo_until_close(ws)
            return

        agent = await fetch_agent_for_call(agent_id, call_id)
        system_prompt = await build_system_prompt(agent, prompt)
        model = pipeline_model(agent)
        voice_id = cartesia_voice_id(agent)
        runtime = runtime_settings(agent)
        trans_mode = str(runtime.get("transcriptionMode") or "accuracy")
        endpointing = 180 if trans_mode == "speed" else 350 if trans_mode == "accuracy" else 250

        try:
            transport = FastAPIWebsocketTransport(
                websocket=ws,
                params=FastAPIWebsocketParams(
                    audio_in_enabled=True,
                    audio_out_enabled=True,
                    audio_in_sample_rate=settings.sample_rate_in,
                    audio_out_sample_rate=settings.sample_rate_out,
                ),
            )
            stt = DeepgramSTTService(
                api_key=settings.deepgram_api_key,
                model=settings.deepgram_model,
                language=settings.deepgram_language,
                interim_results=True,
                endpointing=endpointing,
                punctuate=True,
            )
            llm = GoogleLLMService(
                api_key=settings.gemini_api_key,
                model=model,
            )
            tts_kwargs = {"api_key": settings.cartesia_api_key}
            if voice_id:
                tts_kwargs["voice_id"] = voice_id
            tts = CartesiaTTSService(**tts_kwargs)
            ctx = OpenAILLMContext(messages=[{"role": "system", "content": system_prompt}])
            pipeline = Pipeline(
                [
                    transport.input(),
                    stt,
                    ctx.user(),
                    llm,
                    ctx.assistant(),
                    tts,
                    transport.output(),
                ]
            )
            task = PipelineTask(pipeline)
            runner = PipelineRunner(handle_sigint=False)
            log.info("tier2.pipecat_run", call_id=call_id)
            buffer = TranscriptBuffer(call_id=call_id)
            try:
                await runner.run(task)
            finally:
                try:
                    for msg in getattr(ctx, "messages", []) or []:
                        role = str(msg.get("role", ""))
                        text = str(msg.get("content", ""))
                        if role == "system" or not text.strip():
                            continue
                        mapped = "agent" if role == "assistant" else "user"
                        await buffer.add(mapped, text)
                finally:
                    await buffer.flush()
        except Exception as exc:  # noqa: BLE001
            log.exception("tier2.runner_error", error=str(exc))
            await echo_until_close(ws)
