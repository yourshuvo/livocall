from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
from datetime import UTC, datetime
from time import perf_counter_ns
from typing import Any

import structlog
from bson import ObjectId
from fastapi import WebSocket

from app.agent_runtime import (
    build_system_prompt,
    execute_agent_tool,
    gemini_live_model,
    gemini_voice,
)
from app.audio_codec import (
    pcm16_24k_to_pcmu,
    pcmu_to_pcm16_16k,
    split_pcm16_16k_20ms,
    split_pcm16_24k_20ms,
    split_pcmu_20ms,
)
from app.db import get_db
from app.gemini_live_config import live_config
from app.persistence import TranscriptBuffer
from app.settings import settings
from app.tiers._common import close_unavailable, fetch_agent_for_call
from app.warm_sessions import warm_sessions
from app.web_client import post_voice_event

log = structlog.get_logger()


def _now_ms() -> float:
    return perf_counter_ns() / 1_000_000


@dataclass
class PcmuLatency:
    call_id: str
    marks: dict[str, float] = field(default_factory=dict)

    def mark(self, name: str) -> None:
        if name not in self.marks:
            self.marks[name] = _now_ms()
            log.info("gemini_pcm.latency_mark", call_id=self.call_id, name=name)

    def delta(self, start: str, end: str) -> float | None:
        if start not in self.marks or end not in self.marks:
            return None
        return round(self.marks[end] - self.marks[start], 2)

    async def persist(self) -> None:
        if not ObjectId.is_valid(self.call_id):
            return
        trace = {k: round(v, 2) for k, v in self.marks.items()}
        deltas = {
            "callerAudioToGeminiFirstSendMs": self.delta(
                "first_caller_audio", "first_gemini_audio_send"
            ),
            "callerAudioToModelFirstAudioMs": self.delta(
                "first_caller_audio", "first_model_audio"
            ),
            "modelAudioToFsFirstSendMs": self.delta(
                "first_model_audio", "first_fs_audio_send"
            ),
            "bridgeConnectedToFsFirstSendMs": self.delta(
                "bridge_connected", "first_fs_audio_send"
            ),
        }
        try:
            await get_db()["calls"].update_one(
                {"_id": ObjectId(self.call_id)},
                {"$set": {"traceMetadata.geminiPcmu": trace, "latencyMs": deltas}},
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("gemini_pcm.latency_persist_failed", call_id=self.call_id, error=str(exc))


@dataclass(frozen=True, slots=True)
class ToolResponse:
    payload: dict[str, Any]


@dataclass(frozen=True, slots=True)
class TranscriptUpdate:
    role: str
    text: str


class GeminiPcmBridge:
    def __init__(
        self,
        *,
        wire_format: str = "pcmu",
        input_queue_frames: int = 2,
        bridge_mode: str = "phone",
    ) -> None:
        if wire_format not in {"pcmu", "pcm16"}:
            raise ValueError(f"unknown wire_format: {wire_format}")
        self.wire_format = wire_format
        self.input_queue_frames = max(1, input_queue_frames)
        self.bridge_mode = bridge_mode

    @classmethod
    def for_phone_call(cls) -> GeminiPcmBridge:
        return cls(
            wire_format="pcmu",
            input_queue_frames=150,
            bridge_mode="phone",
        )

    @classmethod
    def for_browser_test(cls) -> GeminiPcmBridge:
        return cls(
            wire_format="pcm16",
            input_queue_frames=8,
            bridge_mode="browser",
        )

    async def run(
        self,
        ws: WebSocket,
        *,
        call_id: str,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
    ) -> None:
        if not settings.gemini_api_key:
            log.warning("gemini_pcm.no_key", hint="set GEMINI_API_KEY")
            await close_unavailable(ws)
            return

        try:
            from google import genai  # type: ignore[import-not-found]
            from google.genai import types  # type: ignore[import-not-found]
        except ImportError:
            log.warning("gemini_pcm.google_genai_missing", hint="install pipecat-ai[google]")
            await close_unavailable(ws)
            return

        warm_session = await warm_sessions.pop(call_id)
        agent = (
            warm_session.agent
            if warm_session is not None
            else await fetch_agent_for_call(agent_id, call_id)
        )
        if warm_session is not None:
            prompt = prompt or warm_session.prompt
            metadata = {**warm_session.metadata, **(metadata or {})}

        system_prompt = (
            warm_session.system_prompt
            if warm_session is not None and warm_session.system_prompt
            else await build_system_prompt(agent, prompt)
        )
        model = warm_session.model if warm_session is not None else gemini_live_model(agent)
        voice = warm_session.voice if warm_session is not None else gemini_voice(agent)
        client = genai.Client(api_key=settings.gemini_api_key)

        input_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=self.input_queue_frames)
        latency = PcmuLatency(call_id)
        transcript = TranscriptBuffer(call_id)
        session_state: dict[str, str] = {}
        latency.mark("bridge_connected")

        reader: asyncio.Task[None] | None = None
        try:
            reader = asyncio.create_task(
                _read_wire_audio(
                    ws,
                    input_queue,
                    call_id,
                    latency,
                    wire_format=self.wire_format,
                )
            )
            for reconnect_attempt in range(3):
                if reader.done():
                    break
                config = live_config(
                    types,
                    system_prompt,
                    voice,
                    agent,
                    session_resumption_handle=session_state.get("handle"),
                )
                try:
                    async with _connected_live_session(
                        client,
                        model=model,
                        config=config,
                        warm_session=warm_session,
                        reconnect_attempt=reconnect_attempt,
                    ) as (session, preconnected):
                        log.info(
                            "gemini_pcm.connected",
                            call_id=call_id,
                            preconnected=preconnected,
                            resumed=bool(session_state.get("handle")),
                            model=model,
                            voice=voice,
                            bridge_mode=self.bridge_mode,
                            wire_format=self.wire_format,
                            input_queue_frames=self.input_queue_frames,
                        )
                        latency.mark("gemini_ws_connected")
                        sender = asyncio.create_task(
                            _send_caller_audio(session, types, input_queue, call_id, latency)
                        )
                        receiver = asyncio.create_task(
                            _receive_model_audio_loop(
                                session,
                                ws,
                                call_id,
                                agent,
                                latency,
                                transcript,
                                wire_format=self.wire_format,
                                session_state=session_state,
                            )
                        )
                        done, pending = await asyncio.wait(
                            {sender, receiver, reader}, return_when=asyncio.FIRST_COMPLETED
                        )
                        should_reconnect = (
                            receiver in done
                            and reader not in done
                            and sender not in done
                            and bool(session_state.get("handle"))
                            and reconnect_attempt < 2
                        )
                        for task in pending:
                            if task is reader and should_reconnect:
                                continue
                            task.cancel()
                        for task in pending:
                            if task is reader and should_reconnect:
                                continue
                            with suppress(asyncio.CancelledError):
                                await task
                        for task in done:
                            try:
                                task.result()
                            except Exception as exc:  # noqa: BLE001
                                if task is receiver and should_reconnect:
                                    log.warning(
                                        "gemini_pcm.receiver_reconnect",
                                        call_id=call_id,
                                        attempt=reconnect_attempt + 1,
                                        error=str(exc),
                                    )
                                    break
                                raise
                        if should_reconnect:
                            log.info(
                                "gemini_pcm.reconnecting",
                                call_id=call_id,
                                attempt=reconnect_attempt + 1,
                            )
                            continue
                        if reader in done or sender in done:
                            break
                        break
                except Exception as exc:  # noqa: BLE001
                    if session_state.get("handle") and not reader.done() and reconnect_attempt < 2:
                        log.warning(
                            "gemini_pcm.reconnect_after_error",
                            call_id=call_id,
                            attempt=reconnect_attempt + 1,
                            error=str(exc),
                        )
                        continue
                    raise
        except Exception as exc:  # noqa: BLE001
            if settings.low_latency_pcmu_bridge_strict:
                log.exception("gemini_pcm.error", call_id=call_id, error=str(exc))
                with suppress(Exception):
                    await ws.close(code=1011)
            else:
                log.exception("gemini_pcm.error", call_id=call_id, error=str(exc))
                await close_unavailable(ws)
        finally:
            if reader is not None and not reader.done():
                reader.cancel()
                with suppress(asyncio.CancelledError):
                    await reader
            await transcript.flush()
            await latency.persist()
            if warm_session is not None:
                await warm_session.close()
            await warm_sessions.cleanup(call_id)


def _live_config(*args: Any, **kwargs: Any) -> dict[str, Any]:
    return live_config(*args, **kwargs)


@asynccontextmanager
async def _connected_live_session(
    client: Any,
    *,
    model: str,
    config: dict[str, Any],
    warm_session: Any | None,
    reconnect_attempt: int,
) -> AsyncIterator[tuple[Any, bool]]:
    if reconnect_attempt == 0 and warm_session is not None and warm_session.live_session is not None:
        try:
            yield warm_session.live_session, True
        finally:
            await warm_session.close()
        return
    async with client.aio.live.connect(
        model=model.replace("models/", ""),
        config=config,
    ) as session:
        yield session, False


async def _read_wire_audio(
    ws: WebSocket,
    input_queue: asyncio.Queue[bytes | None],
    call_id: str,
    latency: PcmuLatency,
    *,
    wire_format: str,
) -> None:
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if not isinstance(data, (bytes, bytearray)):
                continue
            if wire_format == "pcmu":
                chunks = [
                    pcm_chunk
                    for pcmu_chunk in split_pcmu_20ms(bytes(data))
                    for pcm_chunk in split_pcm16_16k_20ms(pcmu_to_pcm16_16k(pcmu_chunk))
                ]
            else:
                chunks = split_pcm16_16k_20ms(bytes(data))
            if chunks:
                latency.mark("first_caller_audio")
            for pcm_chunk in chunks:
                if input_queue.full():
                    input_queue.get_nowait()
                await input_queue.put(pcm_chunk)
    finally:
        await input_queue.put(None)
        log.info("gemini_pcm.reader_done", call_id=call_id)


async def _send_caller_audio(
    session: Any,
    types: Any,
    input_queue: asyncio.Queue[bytes | None],
    call_id: str,
    latency: PcmuLatency,
) -> None:
    while True:
        chunk = await input_queue.get()
        if chunk is None:
            break
        await session.send_realtime_input(
            audio=types.Blob(data=chunk, mime_type="audio/pcm;rate=16000")
        )
        latency.mark("first_gemini_audio_send")
    log.info("gemini_pcm.sender_done", call_id=call_id)


async def _receive_model_audio(
    session: Any,
    ws: WebSocket,
    call_id: str,
    agent: dict[str, Any],
    latency: PcmuLatency,
    transcript: TranscriptBuffer,
    *,
    wire_format: str,
    session_state: dict[str, str] | None = None,
) -> bool:
    publish_tasks: set[asyncio.Task[None]] = set()
    saw_item = False

    def on_publish_done(task: asyncio.Task[None]) -> None:
        publish_tasks.discard(task)
        with suppress(asyncio.CancelledError):
            exc = task.exception()
            if exc is not None:
                log.warning("gemini_pcm.transcript_publish_failed", call_id=call_id, error=str(exc))

    try:
        async for item in _iter_model_output(session, agent, call_id, session_state=session_state):
            saw_item = True
            if isinstance(item, ToolResponse):
                await session.send_tool_response(function_responses=[item.payload])
                continue
            if isinstance(item, TranscriptUpdate):
                task = asyncio.create_task(
                    _publish_transcript(transcript, call_id, item.role, item.text)
                )
                publish_tasks.add(task)
                task.add_done_callback(on_publish_done)
                continue
            audio = item
            latency.mark("first_model_audio")
            for pcm24_chunk in split_pcm16_24k_20ms(audio):
                if wire_format == "pcmu":
                    await ws.send_bytes(pcm16_24k_to_pcmu(pcm24_chunk))
                else:
                    await ws.send_bytes(pcm24_chunk)
                latency.mark("first_fs_audio_send")
    finally:
        if publish_tasks:
            await asyncio.gather(*publish_tasks, return_exceptions=True)
        log.info("gemini_pcm.receiver_done", call_id=call_id)
    return saw_item


async def _receive_model_audio_loop(
    session: Any,
    ws: WebSocket,
    call_id: str,
    agent: dict[str, Any],
    latency: PcmuLatency,
    transcript: TranscriptBuffer,
    *,
    wire_format: str,
    session_state: dict[str, str] | None = None,
) -> None:
    while True:
        saw_item = await _receive_model_audio(
            session,
            ws,
            call_id,
            agent,
            latency,
            transcript,
            wire_format=wire_format,
            session_state=session_state,
        )
        if not saw_item:
            return


async def _publish_transcript(
    transcript: TranscriptBuffer,
    call_id: str,
    role: str,
    text: str,
) -> None:
    text = text.strip()
    if not text:
        return
    at = datetime.now(UTC)
    posted = await post_voice_event(
        {
            "type": "call.transcript",
            "callId": call_id,
            "role": role,
            "text": text,
            "at": at.isoformat(),
        }
    )
    if not posted:
        await transcript.add(role, text)
        await transcript.flush()


async def _iter_model_output(
    session: Any,
    agent: dict[str, Any],
    call_id: str,
    *,
    session_state: dict[str, str] | None = None,
) -> AsyncIterator[bytes | ToolResponse | TranscriptUpdate]:
    output_transcript_chunks: list[str] = []
    async for response in session.receive():
        _capture_session_resumption(call_id, response, session_state)
        go_away = getattr(response, "go_away", None)
        if go_away is not None:
            log.info("gemini_pcm.go_away", call_id=call_id, time_left=str(getattr(go_away, "time_left", "")))
        tool_call = getattr(response, "tool_call", None)
        calls = getattr(tool_call, "function_calls", None) or []
        for call in calls:
            name = str(getattr(call, "name", "") or "")
            args = getattr(call, "args", None) or {}
            call_id_part = str(getattr(call, "id", "") or name)
            started = _now_ms()
            result = await execute_agent_tool(agent, call_id=call_id, name=name, arguments=dict(args))
            log.info(
                "gemini_pcm.tool_result",
                call_id=call_id,
                name=name,
                ok=bool(result.get("ok")),
                source=result.get("source"),
                latency_ms=round(_now_ms() - started, 2),
            )
            yield ToolResponse({"id": call_id_part, "name": name, "response": result})
        content = getattr(response, "server_content", None)
        if getattr(content, "interrupted", False):
            output_transcript_chunks.clear()
            log.info("gemini_pcm.interrupted", call_id=call_id)
            continue
        if output_transcript_chunks and (
            getattr(content, "turn_complete", False)
            or getattr(content, "generation_complete", False)
        ):
            yield TranscriptUpdate("agent", _join_transcript_chunks(output_transcript_chunks))
            output_transcript_chunks.clear()
        turn = getattr(content, "model_turn", None)
        parts = getattr(turn, "parts", None) or []
        for part in parts:
            inline_data = getattr(part, "inline_data", None)
            data = getattr(inline_data, "data", None)
            if isinstance(data, bytes):
                yield data
    if output_transcript_chunks:
        yield TranscriptUpdate("agent", _join_transcript_chunks(output_transcript_chunks))


def _capture_session_resumption(
    call_id: str,
    response: Any,
    session_state: dict[str, str] | None,
) -> None:
    update = getattr(response, "session_resumption_update", None)
    if update is None:
        return
    handle = str(getattr(update, "new_handle", "") or "")
    resumable = bool(getattr(update, "resumable", False))
    log.info("gemini_pcm.session_resumption_update", call_id=call_id, resumable=resumable)
    if resumable and handle and session_state is not None:
        session_state["handle"] = handle


def _transcription_text(value: Any, *, strip: bool = True) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        text = str(value.get("text") or "")
    else:
        text = str(getattr(value, "text", "") or "")
    return text.strip() if strip else text


def _join_transcript_chunks(chunks: list[str]) -> str:
    return "".join(chunks).strip()
