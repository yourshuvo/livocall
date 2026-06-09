"""Tier 2 — Pipecat STT → LLM → TTS pipeline.

Default pipeline is Soniox STT + Gemini Flash + Soniox TTS, with Silero/Pipecat
VAD driving Soniox transcript finalization. Gemini Live remains separate because
it owns native VAD/turn-taking itself.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import WebSocket

from app.agent_runtime import (
    build_system_prompt,
    cartesia_voice_id,
    pipeline_model,
    pipeline_stt_provider,
    pipeline_tts_provider,
    runtime_settings,
    soniox_language,
    soniox_language_hint_codes,
    soniox_voice,
)
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

        agent = await fetch_agent_for_call(agent_id, call_id)
        stt_provider = pipeline_stt_provider(agent)
        tts_provider = pipeline_tts_provider(agent)
        missing = _missing_pipeline_keys(stt_provider, tts_provider)
        if missing:
            log.warning(
                "tier2.no_keys",
                providers={"stt": stt_provider, "tts": tts_provider},
                missing=missing,
                hint="set GEMINI_API_KEY plus the selected STT/TTS provider keys",
            )
            await echo_until_close(ws)
            return

        try:
            from pipecat.audio.vad.silero import (  # type: ignore[import-not-found]
                SileroVADAnalyzer,
                VADParams,
            )
            from pipecat.pipeline.pipeline import Pipeline  # type: ignore[import-not-found]
            from pipecat.pipeline.runner import PipelineRunner  # type: ignore[import-not-found]
            from pipecat.pipeline.task import (  # type: ignore[import-not-found]
                PipelineParams,
                PipelineTask,
            )
            from pipecat.processors.aggregators.llm_context import (  # type: ignore[import-not-found]
                LLMContext,
            )
            from pipecat.processors.aggregators.llm_response_universal import (  # type: ignore[import-not-found]
                LLMContextAggregatorPair,
            )
            from pipecat.processors.audio.vad_processor import (
                VADProcessor,  # type: ignore[import-not-found]
            )
            from pipecat.services.google.llm import (
                GoogleLLMService,  # type: ignore[import-not-found]
            )
            from pipecat.transports.websocket.fastapi import (  # type: ignore[import-not-found]
                FastAPIWebsocketParams,
                FastAPIWebsocketTransport,
            )
        except ImportError as exc:
            log.warning(
                "tier2.pipecat_missing",
                hint="pip install -e '.[voice]' to enable real Pipecat pipelines",
                missing_module=getattr(exc, "name", ""),
                error=str(exc),
            )
            await echo_until_close(ws)
            return

        system_prompt = await build_system_prompt(agent, prompt)
        model = pipeline_model(agent)
        runtime = runtime_settings(agent)
        trans_mode = str(runtime.get("transcriptionMode") or "accuracy")
        context_terms = _context_terms(runtime)

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
            vad = VADProcessor(
                vad_analyzer=SileroVADAnalyzer(
                    sample_rate=settings.sample_rate_in,
                    params=VADParams(
                        confidence=settings.pipecat_vad_confidence,
                        start_secs=settings.pipecat_vad_start_secs,
                        stop_secs=_pipeline_vad_stop_secs(trans_mode),
                        min_volume=settings.pipecat_vad_min_volume,
                    ),
                ),
            )
            stt = _build_stt(stt_provider, agent, trans_mode, context_terms, call_id)
            llm = GoogleLLMService(
                api_key=settings.gemini_api_key,
                model=model,
            )
            tts = _build_tts(tts_provider, agent, trans_mode)
            context = LLMContext([{"role": "system", "content": system_prompt}])
            user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)
            pipeline = Pipeline(
                [
                    transport.input(),
                    vad,
                    stt,
                    user_aggregator,
                    llm,
                    tts,
                    transport.output(),
                    assistant_aggregator,
                ]
            )
            task = PipelineTask(
                pipeline,
                params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
            )
            runner = PipelineRunner(handle_sigint=False)
            log.info(
                "tier2.pipecat_run",
                call_id=call_id,
                stt_provider=stt_provider,
                tts_provider=tts_provider,
                vad="pipecat_silero",
            )
            buffer = TranscriptBuffer(call_id=call_id)
            try:
                await runner.run(task)
            finally:
                try:
                    for msg in getattr(context, "messages", []) or []:
                        if isinstance(msg, dict):
                            role = str(msg.get("role", ""))
                            text = str(msg.get("content", ""))
                        else:
                            role = str(getattr(msg, "role", ""))
                            text = str(getattr(msg, "content", ""))
                        if role in {"system", "developer"} or not text.strip():
                            continue
                        mapped = "agent" if role == "assistant" else "user"
                        await buffer.add(mapped, text)
                finally:
                    await buffer.flush()
        except Exception as exc:  # noqa: BLE001
            log.exception("tier2.runner_error", error=str(exc))
            await echo_until_close(ws)


def _missing_pipeline_keys(stt_provider: str, tts_provider: str) -> list[str]:
    missing: list[str] = []
    if not settings.gemini_api_key:
        missing.append("GEMINI_API_KEY")
    if stt_provider == "soniox" and not settings.soniox_api_key:
        missing.append("SONIOX_API_KEY")
    elif stt_provider == "deepgram" and not settings.deepgram_api_key:
        missing.append("DEEPGRAM_API_KEY")
    if tts_provider == "soniox" and not settings.soniox_api_key:
        missing.append("SONIOX_API_KEY")
    elif tts_provider == "cartesia" and not settings.cartesia_api_key:
        missing.append("CARTESIA_API_KEY")
    return sorted(set(missing))


def _pipeline_vad_stop_secs(transcription_mode: str) -> float:
    if transcription_mode == "speed":
        return max(0.12, min(0.5, settings.pipecat_vad_stop_secs))
    if transcription_mode == "accuracy":
        return max(0.2, min(0.8, settings.pipecat_vad_stop_secs + 0.1))
    return max(0.12, min(1.0, settings.pipecat_vad_stop_secs))


def _context_terms(runtime: dict[str, Any]) -> list[str]:
    raw = str(runtime.get("boostedKeywords") or "")
    return [term.strip() for term in raw.replace("\n", ",").split(",") if term.strip()][:80]


def _build_stt(
    provider: str,
    agent: dict[str, Any],
    transcription_mode: str,
    context_terms: list[str],
    call_id: str,
) -> Any:
    from pipecat.transcriptions.language import Language  # type: ignore[import-not-found]

    if provider == "soniox":
        from pipecat.services.soniox.stt import (  # type: ignore[import-not-found]
            SonioxContextGeneralItem,
            SonioxContextObject,
            SonioxSTTService,
        )

        # Soniox docs recommend vad_force_turn_endpoint=True for low-latency
        # agents: Pipecat local VAD emits VADUserStoppedSpeakingFrame and Soniox
        # finalizes immediately instead of waiting for native endpointing.
        language_hints = [
            _language_enum(Language, code) for code in soniox_language_hint_codes(agent)
        ]
        language_hints = [hint for hint in language_hints if hint is not None]
        context = None
        if context_terms:
            context = SonioxContextObject(
                general=[
                    SonioxContextGeneralItem(key="domain", value="Bangladesh business phone calls")
                ],
                terms=context_terms,
            )
        return SonioxSTTService(
            api_key=settings.soniox_api_key,
            url=settings.soniox_stt_url,
            sample_rate=settings.sample_rate_in,
            vad_force_turn_endpoint=True,
            settings=SonioxSTTService.Settings(
                model=settings.soniox_stt_model,
                language_hints=language_hints or None,
                language_hints_strict=False,
                context=context,
                client_reference_id=call_id,
            ),
        )

    from pipecat.services.deepgram.stt import DeepgramSTTService  # type: ignore[import-not-found]

    endpointing = (
        180 if transcription_mode == "speed" else 350 if transcription_mode == "accuracy" else 250
    )
    return DeepgramSTTService(
        api_key=settings.deepgram_api_key,
        sample_rate=settings.sample_rate_in,
        settings=DeepgramSTTService.Settings(
            model=settings.deepgram_model,
            language=_language_enum(Language, settings.deepgram_language) or Language.EN,
            interim_results=True,
            endpointing=endpointing,
            punctuate=True,
            smart_format=True,
        ),
    )


def _build_tts(provider: str, agent: dict[str, Any], transcription_mode: str) -> Any:
    if provider == "soniox":
        from pipecat.services.soniox.tts import SonioxTTSService  # type: ignore[import-not-found]
        from pipecat.services.tts_service import (
            TextAggregationMode,  # type: ignore[import-not-found]
        )
        from pipecat.transcriptions.language import Language  # type: ignore[import-not-found]

        return SonioxTTSService(
            api_key=settings.soniox_api_key,
            url=settings.soniox_tts_url,
            sample_rate=settings.sample_rate_out,
            audio_format="pcm_s16le",
            text_aggregation_mode=(
                TextAggregationMode.TOKEN
                if transcription_mode == "speed"
                else TextAggregationMode.SENTENCE
            ),
            settings=SonioxTTSService.Settings(
                model=settings.soniox_tts_model,
                voice=soniox_voice(agent),
                language=_language_enum(Language, soniox_language(agent)) or Language.EN,
            ),
        )

    from pipecat.services.cartesia.tts import CartesiaTTSService  # type: ignore[import-not-found]

    voice_id = cartesia_voice_id(agent)
    tts_kwargs: dict[str, Any] = {
        "api_key": settings.cartesia_api_key,
        "sample_rate": settings.sample_rate_out,
    }
    if voice_id:
        tts_kwargs["settings"] = CartesiaTTSService.Settings(voice=voice_id)
    return CartesiaTTSService(**tts_kwargs)


def _language_enum(language_cls: Any, code: str) -> Any | None:
    normalized = code.replace("-", "_").upper()
    return getattr(language_cls, normalized, None) or getattr(language_cls, code.upper(), None)
