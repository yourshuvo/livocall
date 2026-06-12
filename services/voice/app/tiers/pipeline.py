"""Tier 2 — Pipecat STT → LLM → TTS pipeline.

Default pipeline is Soniox STT + Gemini Flash + Soniox TTS, with Silero/Pipecat
VAD driving Soniox transcript finalization. Gemini Live remains separate because
it owns native VAD/turn-taking itself.
"""

from __future__ import annotations

from contextlib import suppress
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import asyncio
import ipaddress
import socket
import structlog
from fastapi import WebSocket

from app.agent_runtime import (
    build_system_prompt,
    cartesia_voice_id,
    pipeline_model,
    pipeline_stt_provider,
    pipeline_tts_provider,
    prompt_parts,
    runtime_settings,
    soniox_language,
    soniox_language_hint_codes,
    soniox_voice,
)
from app.db import get_db
from app.esl import EslClient, EslConfig
from app.persistence import flush_context_transcript
from app import playback_files
from app.settings import settings
from app.tiers._common import close_unavailable, fetch_agent_for_call

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
            await close_unavailable(ws)
            return

        # The audio-fork websocket connects during pre-answer/ringing. Use that
        # time to load Pipecat/Silero/SmartTurn and construct the pipeline;
        # otherwise those synchronous imports/model loads block the event loop
        # after answer and delay the opening audio by several seconds.
        opening_text = _pipeline_opening_text(agent)
        opening_spoken_directly = bool(opening_text and tts_provider == "soniox")
        opening_task: asyncio.Task[bool] | None = None

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
            from pipecat.frames.frames import TTSSpeakFrame  # type: ignore[import-not-found]
            from pipecat.processors.aggregators.llm_context import (  # type: ignore[import-not-found]
                LLMContext,
            )
            from pipecat.processors.aggregators.llm_response_universal import (  # type: ignore[import-not-found]
                LLMContextAggregatorPair,
                LLMUserAggregatorParams,
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
            if opening_task is not None and not opening_task.done():
                opening_task.cancel()
                with suppress(Exception, asyncio.CancelledError):
                    await opening_task
            await close_unavailable(ws)
            return

        system_prompt = await build_system_prompt(agent, prompt)
        model = pipeline_model(agent)
        runtime = runtime_settings(agent)
        trans_mode = _pipeline_transcription_mode(runtime)
        context_terms = _context_terms(runtime)
        output_sample_rate = _phone_pipeline_output_sample_rate()

        try:
            playback_ws = _AudioForkPlaybackWebSocket(ws, call_id=call_id)
            transport = FastAPIWebsocketTransport(
                websocket=playback_ws,
                params=FastAPIWebsocketParams(
                    audio_in_enabled=True,
                    audio_out_enabled=True,
                    audio_in_sample_rate=settings.sample_rate_in,
                    audio_out_sample_rate=output_sample_rate,
                    serializer=_audio_fork_serializer(),
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
            llm = GoogleLLMService(
                api_key=settings.gemini_api_key,
                model=model,
            )
            tts = _build_tts(
                tts_provider,
                agent,
                trans_mode,
                output_sample_rate=output_sample_rate,
            )
            context = LLMContext(
                _initial_pipeline_context_messages(
                    system_prompt,
                    opening_text=opening_text,
                    opening_spoken_directly=opening_spoken_directly,
                )
            )
            user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
                context,
                user_params=LLMUserAggregatorParams(
                    audio_idle_timeout=_pipeline_vad_audio_idle_timeout_secs(trans_mode),
                    user_turn_stop_timeout=_pipeline_user_turn_stop_timeout_secs(trans_mode),
                ),
            )
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
            answered = await _wait_for_call_answer(call_id)
            if not answered:
                log.info("tier2.unanswered_before_pipeline", call_id=call_id)
                return
            if opening_text and opening_spoken_directly:
                opening_task = asyncio.create_task(
                    _speak_opening_direct(
                        ws,
                        agent=agent,
                        call_id=call_id,
                        text=opening_text,
                    )
                )
                log.info("tier2.opening_direct_started", call_id=call_id, chars=len(opening_text))
            elif opening_text:
                await task.queue_frame(TTSSpeakFrame(opening_text, append_to_context=True))
                log.info("tier2.opening_queued", call_id=call_id, chars=len(opening_text))
            log.info(
                "tier2.pipecat_run",
                call_id=call_id,
                stt_provider=stt_provider,
                tts_provider=tts_provider,
                vad="pipecat_silero",
            )
            try:
                await runner.run(task)
            finally:
                await playback_ws.flush_playback()
                if opening_task is not None and not opening_task.done():
                    opening_task.cancel()
                if opening_task is not None:
                    with suppress(Exception, asyncio.CancelledError):
                        await opening_task
                await flush_context_transcript(call_id, context)
        except Exception as exc:  # noqa: BLE001
            log.exception("tier2.runner_error", error=str(exc))
            if opening_task is not None and not opening_task.done():
                opening_task.cancel()
                with suppress(Exception, asyncio.CancelledError):
                    await opening_task
            await close_unavailable(ws)


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


def _pipeline_transcription_mode(runtime: dict[str, Any]) -> str:
    mode = str(runtime.get("transcriptionMode") or "speed").strip().lower()
    return mode if mode in {"speed", "accuracy", "custom"} else "speed"


def _phone_pipeline_output_sample_rate() -> int:
    # /ws/audio is driven by mod_audio_fork raw L16 frames. It is configured
    # with settings.sample_rate_in and expects the same rate in both directions.
    return settings.sample_rate_in


def _pipeline_vad_audio_idle_timeout_secs(transcription_mode: str) -> float:
    raw = float(settings.pipecat_vad_audio_idle_timeout_secs)
    if raw <= 0:
        return 0.0
    upper = 0.5 if transcription_mode == "speed" else 0.8
    target = min(raw, 0.25) if transcription_mode == "speed" else raw
    return max(0.15, min(upper, target))


def _pipeline_user_turn_stop_timeout_secs(transcription_mode: str) -> float:
    if transcription_mode == "accuracy":
        return 0.7
    if transcription_mode == "custom":
        return 0.5
    return 0.3


async def _send_audio_to_freeswitch(ws: Any, call_id: str, audio: bytes) -> None:
    if not audio:
        return
    ok = await _broadcast_audio_to_freeswitch(call_id, audio)
    if not ok:
        log.warning("tier2.fs_broadcast_audio_failed", call_id=call_id, bytes=len(audio))


async def _broadcast_audio_to_freeswitch(call_id: str, audio: bytes) -> bool:
    if not audio:
        return True
    fs_uuid = await _fs_uuid_for_call(call_id)
    if not fs_uuid:
        log.warning("tier2.fs_uuid_missing_for_playback", call_id=call_id)
        return False
    token = playback_files.write_pcm_wav(call_id, audio, sample_rate=settings.sample_rate_in)
    if not token:
        return True
    url = _playback_file_url(token)
    client = EslClient(_esl_config())
    try:
        await client.connect()
        reply = await client.playback(fs_uuid, url)
        log.info(
            "tier2.fs_broadcast_audio",
            call_id=call_id,
            fs_uuid=fs_uuid,
            bytes=len(audio),
            url=url,
            reply=reply,
        )
        return not str(reply).startswith("-ERR")
    except Exception as exc:  # noqa: BLE001
        log.warning("tier2.fs_broadcast_audio_error", call_id=call_id, error=str(exc))
        return False
    finally:
        await client.close()


async def _fs_uuid_for_call(call_id: str) -> str:
    try:
        from bson import ObjectId
    except ImportError:
        return ""
    if not ObjectId.is_valid(call_id):
        return ""
    doc = await get_db()["calls"].find_one({"_id": ObjectId(call_id)}, {"fsUuid": 1})
    return str((doc or {}).get("fsUuid") or "")


def _esl_config() -> EslConfig:
    return EslConfig(
        host=settings.fs_host,
        port=settings.fs_esl_port,
        password=settings.fs_esl_password,
    )


def _playback_file_url(token: str) -> str:
    return f"{_playback_base_url()}/internal/playback/{token}.wav"


def _playback_base_url() -> str:
    if settings.voice_playback_public_url.strip():
        return settings.voice_playback_public_url.strip().rstrip("/")
    parsed = urlsplit(settings.voice_ws_public_url.rstrip("/"))
    scheme = "http" if parsed.scheme == "ws" else "https" if parsed.scheme == "wss" else parsed.scheme
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port
    if settings.voice_ws_bridge_autodetect_enabled and host == "voice.livocall.com":
        bridge_ip = _container_bridge_ipv4()
        if bridge_ip:
            host = bridge_ip
            port = settings.voice_ws_internal_port
            scheme = "http"
    netloc = f"{host}:{port}" if port else host
    path = parsed.path.rstrip("/")
    for suffix in ("/ws/audio-pcmu", "/ws/audio"):
        if path.endswith(suffix):
            path = path[: -len(suffix)]
            break
    return urlunsplit((scheme or "http", netloc, path, "", "")).rstrip("/")


def _container_bridge_ipv4() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("1.1.1.1", 80))
            ip = sock.getsockname()[0]
        if ipaddress.ip_address(ip).is_private:
            return ip
    except (OSError, ValueError):
        return ""
    return ""


def _pcm_stream_chunks(audio: bytes) -> list[bytes]:
    bytes_per_sample = 2
    bytes_per_frame = max(
        bytes_per_sample,
        int(settings.sample_rate_in * bytes_per_sample * settings.fs_codec_ms / 1000),
    )
    # Keep signed-16-bit PCM samples intact.
    if bytes_per_frame % bytes_per_sample:
        bytes_per_frame += 1
    return [audio[i : i + bytes_per_frame] for i in range(0, len(audio), bytes_per_frame)]


def _audio_fork_serializer() -> Any:
    from pipecat.frames.frames import (  # type: ignore[import-not-found]
        Frame,
        InputAudioRawFrame,
        OutputAudioRawFrame,
    )
    from pipecat.serializers.base_serializer import (  # type: ignore[import-not-found]
        FrameSerializer,
    )

    class AudioForkRawAudioSerializer(FrameSerializer):
        async def serialize(self, frame: Frame) -> str | bytes | None:
            if isinstance(frame, OutputAudioRawFrame):
                return bytes(frame.audio)
            return None

        async def deserialize(self, data: str | bytes) -> Frame | None:
            if isinstance(data, (bytes, bytearray)) and data:
                return InputAudioRawFrame(
                    audio=bytes(data),
                    sample_rate=settings.sample_rate_in,
                    num_channels=1,
                )
            return None

    return AudioForkRawAudioSerializer()


class _FreeswitchBroadcastSink:
    def __init__(self, call_id: str, *, debounce_secs: float | None = None) -> None:
        self._call_id = call_id
        if debounce_secs is None:
            debounce_secs = max(0.02, settings.playback_broadcast_debounce_ms / 1000)
        self._debounce_secs = debounce_secs
        self._buffer = bytearray()
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task[None] | None = None

    async def write(self, data: bytes) -> None:
        if not data:
            return
        async with self._lock:
            self._buffer.extend(data)
            current = asyncio.current_task()
            if self._flush_task is not None and self._flush_task is not current:
                self._flush_task.cancel()
            self._flush_task = asyncio.create_task(self._delayed_flush())

    async def _delayed_flush(self) -> None:
        try:
            await asyncio.sleep(self._debounce_secs)
            await self.flush()
        except asyncio.CancelledError:
            return

    async def flush(self) -> None:
        current = asyncio.current_task()
        async with self._lock:
            if self._flush_task is not None and self._flush_task is not current:
                self._flush_task.cancel()
            self._flush_task = None
            audio = bytes(self._buffer)
            self._buffer.clear()
        if audio:
            await _broadcast_audio_to_freeswitch(self._call_id, audio)


class _AudioForkPlaybackWebSocket:
    def __init__(self, ws: WebSocket, *, call_id: str) -> None:
        self._ws = ws
        self._broadcast_sink = _FreeswitchBroadcastSink(call_id)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._ws, name)

    async def send_bytes(self, data: bytes) -> None:
        await self._broadcast_sink.write(data)

    async def send_text(self, data: str) -> None:
        await self._ws.send_text(data)

    async def receive(self) -> Any:
        return await self._ws.receive()

    async def flush_playback(self) -> None:
        await self._broadcast_sink.flush()

    async def close(self, *args: Any, **kwargs: Any) -> None:
        await self.flush_playback()
        await self._ws.close(*args, **kwargs)


def _pipeline_opening_text(agent: dict[str, Any]) -> str:
    runtime = runtime_settings(agent)
    welcome_mode = str(runtime.get("welcomeMode") or "ai").strip().lower()
    if welcome_mode != "ai":
        return ""

    _system_prompt, first_message = prompt_parts(agent)
    first_message = first_message.strip()
    if first_message:
        return first_message

    language = str(agent.get("language") or settings.soniox_language).strip()
    if language in {"bn", "bn-BD", "bn-en-mixed"}:
        return "হ্যালো, কীভাবে সাহায্য করতে পারি?"
    return "Hello, how can I help?"


def _initial_pipeline_context_messages(
    system_prompt: str,
    *,
    opening_text: str,
    opening_spoken_directly: bool,
) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": system_prompt}]
    opening = opening_text.strip()
    if opening_spoken_directly and opening:
        messages.append({"role": "assistant", "content": opening})
    return messages


async def _wait_for_call_answer(call_id: str, timeout_secs: float = 45.0) -> bool:
    try:
        import asyncio

        from bson import ObjectId
    except ImportError:
        return True
    if not ObjectId.is_valid(call_id):
        return True

    db = get_db()
    call_oid = ObjectId(call_id)
    deadline = asyncio.get_running_loop().time() + timeout_secs
    while asyncio.get_running_loop().time() < deadline:
        doc = await db["calls"].find_one(
            {"_id": call_oid},
            {"answeredAt": 1, "endedAt": 1, "direction": 1},
        )
        if doc and doc.get("answeredAt"):
            return True
        if doc and doc.get("direction") == "inbound" and not doc.get("endedAt"):
            return True
        if doc and doc.get("endedAt"):
            return False
        await asyncio.sleep(0.15)
    return False


async def _speak_opening_direct(
    ws: WebSocket,
    *,
    agent: dict[str, Any],
    call_id: str,
    text: str,
) -> bool:
    """Send the opening line before Pipecat finishes STT/LLM startup.

    PipelineTask only processes queued TTSSpeakFrame after StartFrame reaches the
    end of the full STT→LLM→TTS pipeline. On cold calls that meant the first TTS
    arrived after the caller had already hung up. This direct Soniox path creates
    the opening audio immediately, then plays it to FreeSWITCH with
    ``uuid_broadcast`` because the BDIX mod_audio_fork build is capture-only for
    returned websocket audio.
    """
    if not settings.soniox_api_key or not text.strip():
        return False
    try:
        import asyncio
        import base64
        import json
        import time
        import uuid

        import websockets
    except ImportError as exc:  # pragma: no cover - only missing in stripped images
        log.warning("tier2.opening_direct_unavailable", call_id=call_id, error=str(exc))
        return False

    stream_id = f"opening-{call_id[:8]}-{uuid.uuid4().hex[:8]}"
    config: dict[str, Any] = {
        "api_key": settings.soniox_api_key,
        "stream_id": stream_id,
        "model": settings.soniox_tts_model,
        "voice": soniox_voice(agent),
        "audio_format": "pcm_s16le",
        "sample_rate": settings.sample_rate_in,
    }
    language = soniox_language(agent)
    if language:
        config["language"] = language

    started = time.perf_counter()
    audio_bytes = 0
    audio_buffer = bytearray()
    first_audio_ms: int | None = None
    try:
        async with websockets.connect(
            settings.soniox_tts_url,
            open_timeout=2.5,
            close_timeout=0.5,
            max_size=8 * 1024 * 1024,
        ) as tts_ws:
            await tts_ws.send(json.dumps(config))
            await tts_ws.send(
                json.dumps({"stream_id": stream_id, "text": text, "text_end": False})
            )
            await tts_ws.send(json.dumps({"stream_id": stream_id, "text": "", "text_end": True}))
            deadline = time.perf_counter() + 5.0
            while time.perf_counter() < deadline:
                timeout = max(0.1, min(1.0, deadline - time.perf_counter()))
                message = await asyncio.wait_for(tts_ws.recv(), timeout=timeout)
                msg = json.loads(message)
                if msg.get("error_code") is not None:
                    log.warning(
                        "tier2.opening_direct_tts_error",
                        call_id=call_id,
                        error_code=msg.get("error_code"),
                        error_message=msg.get("error_message"),
                    )
                    break
                audio_b64 = msg.get("audio")
                if audio_b64:
                    audio = base64.b64decode(audio_b64)
                    if first_audio_ms is None:
                        first_audio_ms = int((time.perf_counter() - started) * 1000)
                        log.info(
                            "tier2.opening_direct_first_audio",
                            call_id=call_id,
                            first_audio_ms=first_audio_ms,
                            chunk_bytes=len(audio),
                        )
                    audio_buffer.extend(audio)
                    audio_bytes += len(audio)
                if msg.get("terminated"):
                    break
    except Exception as exc:  # noqa: BLE001
        log.warning("tier2.opening_direct_failed", call_id=call_id, error=str(exc))
        return audio_bytes > 0

    if audio_bytes > 0:
        await _send_audio_to_freeswitch(ws, call_id, bytes(audio_buffer))
        log.info(
            "tier2.opening_direct_spoken",
            call_id=call_id,
            chars=len(text),
            audio_bytes=audio_bytes,
            first_audio_ms=first_audio_ms,
            total_ms=int((time.perf_counter() - started) * 1000),
        )
        return True
    return False


def _soniox_tts_text_aggregation_mode(transcription_mode: str) -> Any:
    from pipecat.services.tts_service import TextAggregationMode  # type: ignore[import-not-found]

    if transcription_mode == "custom":
        return TextAggregationMode.SENTENCE
    return TextAggregationMode.TOKEN


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


def _build_tts(
    provider: str,
    agent: dict[str, Any],
    transcription_mode: str,
    *,
    output_sample_rate: int | None = None,
) -> Any:
    sample_rate = output_sample_rate or settings.sample_rate_out
    if provider == "soniox":
        from pipecat.services.soniox.tts import SonioxTTSService  # type: ignore[import-not-found]
        from pipecat.transcriptions.language import Language  # type: ignore[import-not-found]

        return SonioxTTSService(
            api_key=settings.soniox_api_key,
            url=settings.soniox_tts_url,
            sample_rate=sample_rate,
            audio_format="pcm_s16le",
            text_aggregation_mode=_soniox_tts_text_aggregation_mode(transcription_mode),
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
        "sample_rate": sample_rate,
    }
    if voice_id:
        tts_kwargs["settings"] = CartesiaTTSService.Settings(voice=voice_id)
    return CartesiaTTSService(**tts_kwargs)


def _language_enum(language_cls: Any, code: str) -> Any | None:
    normalized = code.replace("-", "_").upper()
    return getattr(language_cls, normalized, None) or getattr(language_cls, code.upper(), None)
