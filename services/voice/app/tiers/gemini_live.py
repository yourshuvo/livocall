"""Tier 1 — Gemini Live (end-to-end multimodal) via Pipecat.

mod_audio_fork sends 16 kHz PCM frames over the WebSocket; we forward those
into a Pipecat pipeline that runs Gemini's multimodal-live LLM and pipes the
TTS audio back to FreeSWITCH (which resamples to the trunk codec).

If `pipecat-ai[google]` isn't installed or `GEMINI_API_KEY` is missing, we
fall back to the echo loop so end-to-end calls still complete.
"""

from __future__ import annotations

import structlog
from fastapi import WebSocket

from app.agent_runtime import build_system_prompt, gemini_live_model, gemini_voice
from app.settings import settings
from app.tiers._common import echo_until_close, fetch_agent_for_call
from app.warm_sessions import warm_sessions

log = structlog.get_logger()


class GeminiLiveTier:
    async def run(
        self,
        ws: WebSocket,
        *,
        call_id: str,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
    ) -> None:
        log.info("tier1.start", call_id=call_id, agent_id=agent_id)
        if not settings.gemini_api_key:
            log.warning("tier1.no_key", hint="set GEMINI_API_KEY to enable Gemini Live")
            await echo_until_close(ws)
            return

        try:
            from pipecat.frames.frames import EndFrame  # type: ignore[import-not-found]
            from pipecat.pipeline.pipeline import Pipeline  # type: ignore[import-not-found]
            from pipecat.pipeline.runner import PipelineRunner  # type: ignore[import-not-found]
            from pipecat.pipeline.task import PipelineTask  # type: ignore[import-not-found]
            context_window_compression_params = None
            gemini_vad_params = None

            try:
                from pipecat.services.google.gemini_live import (  # type: ignore[import-not-found]
                    ContextWindowCompressionParams,
                    GeminiLiveLLMService,
                    GeminiVADParams,
                )
            except ImportError:
                from pipecat.services.gemini_multimodal_live import (  # type: ignore[import-not-found]
                    GeminiMultimodalLiveLLMService as GeminiLiveLLMService,
                )

                context_window_compression_params = None
                gemini_vad_params = None
            else:
                context_window_compression_params = ContextWindowCompressionParams
                gemini_vad_params = GeminiVADParams
            from pipecat.transports.network.websocket_server import (  # type: ignore[import-not-found]
                FastAPIWebsocketParams,
                FastAPIWebsocketTransport,
            )
        except ImportError:
            log.warning(
                "tier1.pipecat_missing",
                hint="pip install -e '.[voice]' to enable real Pipecat pipelines",
            )
            await echo_until_close(ws)
            return

        warm_session = await warm_sessions.pop(call_id)
        agent = warm_session.agent if warm_session is not None else await fetch_agent_for_call(agent_id, call_id)
        if warm_session is not None:
            prompt = prompt or warm_session.prompt
            metadata = {**warm_session.metadata, **(metadata or {})}
        system_prompt = await build_system_prompt(agent, prompt)
        model = gemini_live_model(agent)
        voice = gemini_voice(agent)

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
            llm_kwargs = {
                "system_instruction": system_prompt,
            }
            service_settings = getattr(GeminiLiveLLMService, "Settings", None)
            if service_settings is not None:
                vad = (
                    gemini_vad_params(
                        silence_duration_ms=settings.gemini_live_vad_silence_ms,
                        prefix_padding_ms=settings.gemini_live_vad_prefix_padding_ms,
                    )
                    if gemini_vad_params is not None
                    else None
                )
                compression = (
                    context_window_compression_params(
                        enabled=settings.gemini_live_context_compression_enabled
                    )
                    if context_window_compression_params is not None
                    else None
                )
                llm_kwargs = {
                    "settings": service_settings(
                        model=model,
                        system_instruction=system_prompt,
                        voice=voice,
                        language=settings.gemini_live_language,
                        temperature=settings.gemini_live_temperature,
                        max_tokens=settings.gemini_live_max_tokens,
                        vad=vad,
                        context_window_compression=compression,
                    ),
                    "generate_on_context_initialization": settings.first_turn_prompt_enabled,
                }
            llm = GeminiLiveLLMService(
                api_key=settings.gemini_api_key,
                **{k: v for k, v in llm_kwargs.items() if k != "api_key"},
            )
            pipeline = Pipeline([transport.input(), llm, transport.output()])
            task = PipelineTask(pipeline)
            runner = PipelineRunner(handle_sigint=False)
            log.info(
                "tier1.pipecat_run",
                call_id=call_id,
                preconnected=warm_session is not None,
                model=model,
                voice=voice,
            )
            await runner.run(task)
            await task.queue_frame(EndFrame())
        except Exception as exc:  # noqa: BLE001
            log.exception("tier1.runner_error", error=str(exc))
            await echo_until_close(ws)
        finally:
            await warm_sessions.cleanup(call_id)
