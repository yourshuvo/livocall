from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import BackgroundTasks, HTTPException, Request, status

from app.agent_runtime import (
    build_system_prompt,
    execute_agent_tool,
    gemini_live_model,
    gemini_live_vad_prefix_padding_ms,
    gemini_live_vad_silence_ms,
    gemini_tool_declarations,
    gemini_voice,
    pipeline_model,
    pipeline_stt_provider,
    pipeline_tts_provider,
    runtime_settings,
    soniox_language,
)
from app.persistence import TranscriptBuffer
from app.settings import settings
from app.tiers._common import fetch_agent_for_call
from app.web_client import post_voice_event
from app.ws_auth import verify as ws_verify

log = structlog.get_logger()


@dataclass(frozen=True, slots=True)
class BrowserWebRTCContext:
    call_id: str
    agent_id: str
    tier: str
    prompt: str
    metadata: dict[str, str]


@dataclass(frozen=True, slots=True)
class PipecatWebRTCImports:
    SmallWebRTCRequest: Any
    SmallWebRTCPatchRequest: Any
    SmallWebRTCRequestHandler: Any
    IceCandidate: Any
    IceServer: Any


_small_webrtc_handler: Any | None = None


def _load_webrtc_imports() -> PipecatWebRTCImports:
    try:
        from pipecat.transports.smallwebrtc.connection import (
            IceServer,  # type: ignore[import-not-found]
        )
        from pipecat.transports.smallwebrtc.request_handler import (  # type: ignore[import-not-found]
            IceCandidate,
            SmallWebRTCPatchRequest,
            SmallWebRTCRequest,
            SmallWebRTCRequestHandler,
        )
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pipecat WebRTC dependencies are not installed; install services/voice with .[voice]",
        ) from exc
    return PipecatWebRTCImports(
        SmallWebRTCRequest=SmallWebRTCRequest,
        SmallWebRTCPatchRequest=SmallWebRTCPatchRequest,
        SmallWebRTCRequestHandler=SmallWebRTCRequestHandler,
        IceCandidate=IceCandidate,
        IceServer=IceServer,
    )


def _metadata_from_query(request: Request) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for item in request.query_params.getlist("meta"):
        if ":" not in item:
            continue
        key, value = item.split(":", 1)
        metadata[key] = value
    return metadata


def _context_from_query(request: Request) -> BrowserWebRTCContext:
    call_id = request.query_params.get("call_id", "")
    agent_id = request.query_params.get("agent_id", "")
    tier = request.query_params.get("tier", "gemini_live")
    prompt = request.query_params.get("prompt", "")
    auth = request.query_params.get("auth", "")

    if not settings.browser_webrtc_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="browser WebRTC is disabled",
        )
    if not call_id or not agent_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing call_id or agent_id")
    if not ws_verify(call_id, auth or None):
        log.warning("browser_webrtc.auth_failed", call_id=call_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid WebRTC auth")
    if tier not in {"gemini_live", "pipeline"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="browser WebRTC currently supports gemini_live and pipeline agents only",
        )

    return BrowserWebRTCContext(
        call_id=call_id,
        agent_id=agent_id,
        tier=tier,
        prompt=prompt,
        metadata=_metadata_from_query(request),
    )


def public_ice_servers() -> list[dict[str, str | list[str]]]:
    servers: list[dict[str, str | list[str]]] = [
        {"urls": url.strip()}
        for url in settings.webrtc_ice_servers.split(",")
        if url.strip()
    ]
    if settings.webrtc_turn_url:
        turn: dict[str, str | list[str]] = {"urls": settings.webrtc_turn_url}
        if settings.webrtc_turn_username:
            turn["username"] = settings.webrtc_turn_username
        if settings.webrtc_turn_credential:
            turn["credential"] = settings.webrtc_turn_credential
        servers.append(turn)
    return servers


def _server_ice_servers(ice_server_type: Any) -> list[Any]:
    servers: list[Any] = []
    for item in public_ice_servers():
        urls = item["urls"]
        if isinstance(urls, list):
            for url in urls:
                servers.append(ice_server_type(urls=url))
            continue
        kwargs = {"urls": urls}
        if "username" in item:
            kwargs["username"] = item["username"]
        if "credential" in item:
            kwargs["credential"] = item["credential"]
        servers.append(ice_server_type(**kwargs))
    return servers


def _get_handler(imports: PipecatWebRTCImports) -> Any:
    global _small_webrtc_handler
    if _small_webrtc_handler is None:
        _small_webrtc_handler = imports.SmallWebRTCRequestHandler(
            ice_servers=_server_ice_servers(imports.IceServer)
        )
    return _small_webrtc_handler


def _request_model(model_type: Any, body: dict[str, Any]) -> Any:
    if hasattr(model_type, "from_dict"):
        return model_type.from_dict(dict(body))
    if hasattr(model_type, "model_validate"):
        return model_type.model_validate(body)
    return model_type(**body)


def _patch_request_model(imports: PipecatWebRTCImports, body: dict[str, Any]) -> Any:
    normalized = dict(body)
    if "pcId" in normalized and "pc_id" not in normalized:
        normalized["pc_id"] = normalized.pop("pcId")
    pc_id = normalized.get("pc_id")
    candidates = normalized.get("candidates")
    if candidates is None and "candidate" in normalized:
        candidates = [normalized["candidate"]]
    if isinstance(candidates, dict):
        candidates = [candidates]
    if not isinstance(pc_id, str) or not pc_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing pc_id")
    if not isinstance(candidates, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing candidates")

    ice_candidates = []
    for candidate in candidates:
        if hasattr(candidate, "candidate"):
            ice_candidates.append(candidate)
            continue
        if not isinstance(candidate, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid ICE candidate")
        raw_candidate = candidate.get("candidate")
        sdp_mid = candidate.get("sdp_mid", candidate.get("sdpMid"))
        sdp_mline_index = candidate.get("sdp_mline_index", candidate.get("sdpMLineIndex"))
        if not raw_candidate:
            continue
        if not isinstance(raw_candidate, str):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid ICE candidate")
        try:
            parsed_sdp_mline_index = (
                int(sdp_mid)
                if sdp_mline_index is None and isinstance(sdp_mid, str) and sdp_mid.isdecimal()
                else int(sdp_mline_index)
            )
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid ICE candidate m-line index",
            ) from exc
        ice_candidates.append(
            imports.IceCandidate(
                candidate=raw_candidate,
                sdp_mid="" if sdp_mid is None else str(sdp_mid),
                sdp_mline_index=parsed_sdp_mline_index,
            )
        )

    normalized["candidates"] = ice_candidates
    return _request_model(imports.SmallWebRTCPatchRequest, normalized)


def _gemini_live_tools(declarations: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    if not declarations:
        return None
    return [{"function_declarations": declarations}]


def _supports_non_blocking_live_tools(model: str) -> bool:
    return "gemini-3" not in model


def _register_live_tool_handler(
    llm: Any,
    handler: Callable[[Any], Awaitable[None]],
    tools: list[dict[str, Any]],
    *,
    model: str,
) -> None:
    if tools:
        llm.register_function(
            None,
            handler,
            cancel_on_interruption=not _supports_non_blocking_live_tools(model),
        )


def _is_dashboard_browser_test(metadata: dict[str, str] | None) -> bool:
    return (metadata or {}).get("source") == "dashboard-browser-test"


def _is_landing_webcall(metadata: dict[str, str] | None) -> bool:
    return (metadata or {}).get("source") == "landing-webcall"


def _is_non_billable_test_session(metadata: dict[str, str] | None) -> bool:
    return _is_dashboard_browser_test(metadata) or _is_landing_webcall(metadata)


def _public_webcall_max_duration_sec(metadata: dict[str, str] | None) -> int:
    if not _is_landing_webcall(metadata):
        return 0
    try:
        raw = int(float((metadata or {}).get("maxDurationSec", "240")))
    except (TypeError, ValueError):
        raw = 240
    return min(240, max(15, raw))


def _metadata_gemini_model(metadata: dict[str, str] | None) -> str:
    if not _is_landing_webcall(metadata):
        return ""
    model = str((metadata or {}).get("model") or "").strip()
    return model if model.startswith("models/") else f"models/{model}" if model else ""


def _metadata_gemini_language(metadata: dict[str, str] | None) -> str:
    language = str((metadata or {}).get("language") or "").strip()
    if _is_landing_webcall(metadata):
        return "bn"
    return language


def _with_bangla_only_guard(system_prompt: str) -> str:
    if "Language rule: speak only Bangla/Bengali" in system_prompt:
        return system_prompt
    return (
        f"{system_prompt}\n\nLanguage rule: speak only Bangla/Bengali. "
        "Do not switch to English except for names, product names, URLs, or unavoidable technical terms. "
        "Do not repeat the caller's words verbatim; answer naturally and move the conversation forward."
    )


def _pipeline_stt_provider_for_browser(agent: dict[str, Any]) -> str:
    provider = pipeline_stt_provider(agent)
    # Browser/WebRTC is the most latency-sensitive path. If an existing Bangla
    # or Soniox-voice agent still has the older Deepgram setting, prefer Soniox
    # when available: Soniox accepts Bangla/English hints and is configured with
    # vad_force_turn_endpoint=True in the shared builder.
    if (
        provider == "deepgram"
        and settings.soniox_api_key
        and (soniox_language(agent) == "bn" or pipeline_tts_provider(agent) == "soniox")
    ):
        return "soniox"
    return provider


def prewarm() -> dict[str, object]:
    if not settings.browser_webrtc_enabled:
        return {
            "ok": False,
            "enabled": False,
            "handlerReady": False,
            "iceServers": public_ice_servers(),
        }
    imports = _load_webrtc_imports()
    _get_handler(imports)
    log.info("browser_webrtc.prewarmed")
    return {"ok": True, "enabled": True, "handlerReady": True, "iceServers": public_ice_servers()}


async def handle_offer(
    request: Request,
    background_tasks: BackgroundTasks,
    *,
    run_bot: Callable[..., Awaitable[None]] | None = None,
) -> Any:
    context = _context_from_query(request)
    imports = _load_webrtc_imports()
    handler = _get_handler(imports)
    body = await request.json()
    offer = _request_model(imports.SmallWebRTCRequest, body)

    bot_runner = run_bot or _browser_bot_for_tier(context.tier)

    async def on_connection(connection: Any) -> None:
        background_tasks.add_task(
            bot_runner,
            connection,
            call_id=context.call_id,
            agent_id=context.agent_id,
            prompt=context.prompt,
            metadata={**context.metadata, "source": context.metadata.get("source", "browser-webrtc")},
        )

    log.info(
        "browser_webrtc.offer",
        call_id=context.call_id,
        agent_id=context.agent_id,
        tier=context.tier,
    )
    return await handler.handle_web_request(
        request=offer,
        webrtc_connection_callback=on_connection,
    )


async def handle_ice_candidate(request: Request) -> dict[str, str]:
    context = _context_from_query(request)
    imports = _load_webrtc_imports()
    handler = _get_handler(imports)
    body = await request.json()
    try:
        patch = _patch_request_model(imports, body)
    except HTTPException as exc:
        candidates = body.get("candidates") if isinstance(body, dict) else None
        log.warning(
            "browser_webrtc.patch_rejected",
            call_id=context.call_id,
            detail=exc.detail,
            body_keys=sorted(body.keys()) if isinstance(body, dict) else [],
            candidate_count=len(candidates) if isinstance(candidates, list) else None,
        )
        raise
    await handler.handle_patch_request(patch)
    return {"status": "success", "callId": context.call_id}


def _browser_bot_for_tier(tier: str) -> Callable[..., Awaitable[None]]:
    if tier == "pipeline":
        return run_browser_pipeline_bot
    return run_browser_gemini_bot


async def run_browser_pipeline_bot(
    webrtc_connection: Any,
    *,
    call_id: str,
    agent_id: str,
    prompt: str = "",
    metadata: dict[str, str] | None = None,
) -> None:
    try:
        from pipecat.audio.vad.silero import (  # type: ignore[import-not-found]
            SileroVADAnalyzer,
            VADParams,
        )
        from pipecat.frames.frames import LLMRunFrame  # type: ignore[import-not-found]
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
        from pipecat.processors.audio.vad_processor import (  # type: ignore[import-not-found]
            VADProcessor,
        )
        from pipecat.services.google.llm import GoogleLLMService  # type: ignore[import-not-found]
        from pipecat.transports.base_transport import (
            TransportParams,  # type: ignore[import-not-found]
        )
        from pipecat.transports.smallwebrtc.transport import (  # type: ignore[import-not-found]
            SmallWebRTCTransport,
        )

        from app.tiers.pipeline import (  # noqa: PLC0415
            _build_stt,
            _build_tts,
            _context_terms,
            _missing_pipeline_keys,
            _pipeline_transcription_mode,
            _pipeline_vad_audio_idle_timeout_secs,
            _pipeline_vad_stop_secs,
        )
    except ImportError as exc:
        log.warning(
            "browser_pipeline.pipecat_missing",
            hint="pip install -e '.[voice]' to enable browser pipeline WebRTC",
            missing_module=getattr(exc, "name", ""),
            error=str(exc),
        )
        return

    agent = await fetch_agent_for_call(agent_id, call_id)
    stt_provider = _pipeline_stt_provider_for_browser(agent)
    tts_provider = pipeline_tts_provider(agent)
    missing = _missing_pipeline_keys(stt_provider, tts_provider)
    if missing:
        log.warning(
            "browser_pipeline.no_keys",
            call_id=call_id,
            providers={"stt": stt_provider, "tts": tts_provider},
            missing=missing,
            hint="set GEMINI_API_KEY plus the selected STT/TTS provider keys",
        )
        return

    system_prompt = await build_system_prompt(agent, prompt)
    if _is_landing_webcall(metadata) or (metadata or {}).get("banglaOnly") == "true":
        system_prompt = _with_bangla_only_guard(system_prompt)
    model = pipeline_model(agent)
    runtime = runtime_settings(agent)
    trans_mode = _pipeline_transcription_mode(runtime)
    context_terms = _context_terms(runtime)
    started_at = datetime.now(UTC)
    outcome = "completed"
    hangup_cause = "browser_pipeline_disconnected"

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=settings.sample_rate_in,
            audio_out_sample_rate=settings.sample_rate_out,
            audio_out_10ms_chunks=2,
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
        audio_idle_timeout=_pipeline_vad_audio_idle_timeout_secs(trans_mode),
    )
    stt = _build_stt(stt_provider, agent, trans_mode, context_terms, call_id)
    llm = GoogleLLMService(api_key=settings.gemini_api_key, model=model)
    tts = _build_tts(
        tts_provider,
        agent,
        trans_mode,
        output_sample_rate=settings.sample_rate_out,
    )
    initial_messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    if _should_start_with_ai(agent):
        initial_messages.append(
            {
                "role": "user",
                "content": "Start the live browser call now with the configured opening. Keep it brief.",
            }
        )
    context = LLMContext(initial_messages)
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
    task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=True, enable_usage_metrics=True))

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport: Any, _client: Any) -> None:
        log.info(
            "browser_pipeline.connected",
            call_id=call_id,
            agent_id=agent_id,
            model=model,
            stt_provider=stt_provider,
            tts_provider=tts_provider,
        )
        if _should_start_with_ai(agent):
            await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport: Any, _client: Any) -> None:
        log.info("browser_pipeline.disconnected", call_id=call_id)
        await task.cancel()

    async def cancel_after_public_limit() -> None:
        nonlocal hangup_cause
        limit_sec = _public_webcall_max_duration_sec(metadata)
        if limit_sec <= 0:
            return
        await asyncio.sleep(limit_sec)
        hangup_cause = "public_webcall_duration_limit"
        log.info("browser_pipeline.public_limit_reached", call_id=call_id, limit_sec=limit_sec)
        await task.cancel()

    runner = PipelineRunner(handle_sigint=False)
    limit_task: asyncio.Task[None] | None = None
    try:
        if _is_landing_webcall(metadata):
            limit_task = asyncio.create_task(cancel_after_public_limit())
        await runner.run(task)
    except Exception as exc:  # noqa: BLE001
        outcome = "failed"
        hangup_cause = "browser_pipeline_error"
        log.exception("browser_pipeline.error", call_id=call_id, error=str(exc))
    finally:
        if limit_task is not None and not limit_task.done():
            limit_task.cancel()
        if _is_non_billable_test_session(metadata):
            ended_at = datetime.now(UTC)
            await post_voice_event(
                {
                    "type": "call.completed",
                    "callId": call_id,
                    "endedAt": ended_at.isoformat(),
                    "durationSec": max(0, int((ended_at - started_at).total_seconds())),
                    "outcome": outcome,
                    "cost": {
                        "sttPaisa": 0,
                        "llmPaisa": 0,
                        "ttsPaisa": 0,
                        "sipPaisa": 0,
                        "totalPaisa": 0,
                    },
                    "hangupCause": hangup_cause,
                }
            )
        else:
            transcript = TranscriptBuffer(call_id=call_id)
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
                    if text.startswith("Start the live browser call now"):
                        continue
                    mapped = "agent" if role == "assistant" else "user"
                    await transcript.add(mapped, text)
            finally:
                await transcript.flush()


async def run_browser_gemini_bot(
    webrtc_connection: Any,
    *,
    call_id: str,
    agent_id: str,
    prompt: str = "",
    metadata: dict[str, str] | None = None,
) -> None:
    if not settings.gemini_api_key:
        log.warning("browser_webrtc.no_gemini_key", hint="set GEMINI_API_KEY")
        return

    try:
        from pipecat.frames.frames import (  # type: ignore[import-not-found]
            FunctionCallResultProperties,
            LLMRunFrame,
        )
        from pipecat.pipeline.pipeline import Pipeline  # type: ignore[import-not-found]
        from pipecat.pipeline.runner import PipelineRunner  # type: ignore[import-not-found]
        from pipecat.pipeline.task import (  # type: ignore[import-not-found]
            PipelineParams,
            PipelineTask,
        )
        from pipecat.processors.aggregators.llm_context import (
            LLMContext,  # type: ignore[import-not-found]
        )
        from pipecat.processors.aggregators.llm_response_universal import (  # type: ignore[import-not-found]
            LLMContextAggregatorPair,
            LLMUserAggregatorParams,
        )
        from pipecat.services.google.gemini_live.llm import (  # type: ignore[import-not-found]
            ContextWindowCompressionParams,
            GeminiLiveLLMService,
            GeminiVADParams,
        )
        from pipecat.transports.base_transport import (
            TransportParams,  # type: ignore[import-not-found]
        )
        from pipecat.transports.smallwebrtc.transport import (
            SmallWebRTCTransport,  # type: ignore[import-not-found]
        )
    except ImportError as exc:
        log.warning(
            "browser_webrtc.pipecat_missing",
            hint="pip install -e '.[voice]' to enable browser WebRTC",
            missing_module=getattr(exc, "name", ""),
            error=str(exc),
        )
        return

    agent = await fetch_agent_for_call(agent_id, call_id)
    system_prompt = await build_system_prompt(agent, prompt)
    if _is_landing_webcall(metadata) or (metadata or {}).get("banglaOnly") == "true":
        system_prompt = _with_bangla_only_guard(system_prompt)
    model = _metadata_gemini_model(metadata) or gemini_live_model(agent)
    voice = gemini_voice(agent)
    language = _metadata_gemini_language(metadata) or settings.gemini_live_language
    tools = gemini_tool_declarations(agent)
    transcript = TranscriptBuffer(call_id)
    started_at = datetime.now(UTC)
    outcome = "completed"
    hangup_cause = "browser_test_disconnected"

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_out_10ms_chunks=2,
        ),
    )
    llm = GeminiLiveLLMService(
        api_key=settings.gemini_api_key,
        tools=_gemini_live_tools(tools),
        settings=GeminiLiveLLMService.Settings(
            model=model,
            voice=voice,
            system_instruction=system_prompt,
            language=language,
            temperature=settings.gemini_live_temperature,
            max_tokens=settings.gemini_live_max_tokens,
            vad=GeminiVADParams(
                disabled=False,
                prefix_padding_ms=gemini_live_vad_prefix_padding_ms(agent),
                silence_duration_ms=gemini_live_vad_silence_ms(agent),
            ),
            context_window_compression=ContextWindowCompressionParams(
                enabled=settings.gemini_live_context_compression_enabled,
            ),
        ),
    )

    async def handle_tool_call(params: Any) -> None:
        tool_started = datetime.now(UTC)
        result = await execute_agent_tool(
            agent,
            call_id=call_id,
            name=str(params.function_name),
            arguments=dict(params.arguments or {}),
        )
        log.info(
            "browser_webrtc.tool_result",
            call_id=call_id,
            name=str(params.function_name),
            ok=bool(result.get("ok")),
            source=result.get("source"),
            latency_ms=max(0, int((datetime.now(UTC) - tool_started).total_seconds() * 1000)),
        )
        await params.result_callback(result, properties=FunctionCallResultProperties(run_llm=True))

    _register_live_tool_handler(llm, handle_tool_call, tools, model=model)

    initial_messages = []
    if _should_start_with_ai(agent):
        initial_messages.append(
            {
                "role": "user",
                "content": "Start the live browser call now with the configured opening. Keep it brief.",
            }
        )
    context = LLMContext(initial_messages)
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(),
    )
    pipeline = Pipeline(
        [
            transport.input(),
            user_aggregator,
            llm,
            transport.output(),
            assistant_aggregator,
        ]
    )
    task = PipelineTask(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport: Any, _client: Any) -> None:
        log.info(
            "browser_webrtc.connected",
            call_id=call_id,
            agent_id=agent_id,
            model=model,
            voice=voice,
        )
        if _should_start_with_ai(agent):
            await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport: Any, _client: Any) -> None:
        log.info("browser_webrtc.disconnected", call_id=call_id)
        await task.cancel()

    async def cancel_after_public_limit() -> None:
        nonlocal hangup_cause
        limit_sec = _public_webcall_max_duration_sec(metadata)
        if limit_sec <= 0:
            return
        await asyncio.sleep(limit_sec)
        hangup_cause = "public_webcall_duration_limit"
        log.info("browser_webrtc.public_limit_reached", call_id=call_id, limit_sec=limit_sec)
        await task.cancel()

    runner = PipelineRunner(handle_sigint=False)
    limit_task: asyncio.Task[None] | None = None
    try:
        if _is_landing_webcall(metadata):
            limit_task = asyncio.create_task(cancel_after_public_limit())
        await runner.run(task)
    except Exception as exc:  # noqa: BLE001
        outcome = "failed"
        hangup_cause = "browser_webrtc_error"
        log.exception("browser_webrtc.error", call_id=call_id, error=str(exc))
    finally:
        if limit_task is not None and not limit_task.done():
            limit_task.cancel()
        if _is_non_billable_test_session(metadata):
            ended_at = datetime.now(UTC)
            await post_voice_event(
                {
                    "type": "call.completed",
                    "callId": call_id,
                    "endedAt": ended_at.isoformat(),
                    "durationSec": max(0, int((ended_at - started_at).total_seconds())),
                    "outcome": outcome,
                    "cost": {
                        "sttPaisa": 0,
                        "llmPaisa": 0,
                        "ttsPaisa": 0,
                        "sipPaisa": 0,
                        "totalPaisa": 0,
                    },
                    "hangupCause": hangup_cause,
                }
            )
        else:
            for msg in getattr(context, "messages", []) or []:
                if isinstance(msg, dict):
                    role = str(msg.get("role", ""))
                    text = str(msg.get("content", "")).strip()
                else:
                    role = str(getattr(msg, "role", ""))
                    text = str(getattr(msg, "content", "")).strip()
                if role == "system" or not text:
                    continue
                if text.startswith("Start the live browser call now"):
                    continue
                await transcript.add("agent" if role == "assistant" else "user", text)
            await transcript.flush()


def _should_start_with_ai(agent: dict[str, Any]) -> bool:
    runtime = agent.get("runtimeSettings") if isinstance(agent.get("runtimeSettings"), dict) else {}
    welcome_mode = str(runtime.get("welcomeMode") or "ai")
    return welcome_mode == "ai"


async def aclose() -> None:
    global _small_webrtc_handler
    if _small_webrtc_handler is not None:
        await _small_webrtc_handler.close()
        _small_webrtc_handler = None
