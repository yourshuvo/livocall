from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import suppress
from dataclasses import dataclass, field
from time import perf_counter_ns
from typing import Any

import structlog
from bson import ObjectId
from fastapi import WebSocket

from app.agent_runtime import (
    build_system_prompt,
    execute_agent_tool,
    gemini_live_model,
    gemini_tool_declarations,
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
from app.settings import settings
from app.tiers._common import echo_until_close, fetch_agent_for_call
from app.warm_sessions import warm_sessions

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
            "callerAudioToGeminiFirstSendMs": self.delta("first_caller_audio", "first_gemini_audio_send"),
            "callerAudioToModelFirstAudioMs": self.delta("first_caller_audio", "first_model_audio"),
            "modelAudioToFsFirstSendMs": self.delta("first_model_audio", "first_fs_audio_send"),
            "bridgeConnectedToFsFirstSendMs": self.delta("bridge_connected", "first_fs_audio_send"),
        }
        try:
            await get_db()["calls"].update_one(
                {"_id": ObjectId(self.call_id)},
                {"$set": {"traceMetadata.geminiPcmu": trace, "latencyMs": deltas}},
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("gemini_pcm.latency_persist_failed", call_id=self.call_id, error=str(exc))


class GeminiPcmBridge:
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
            await echo_until_close(ws)
            return

        try:
            from google import genai  # type: ignore[import-not-found]
            from google.genai import types  # type: ignore[import-not-found]
        except ImportError:
            log.warning("gemini_pcm.google_genai_missing", hint="install pipecat-ai[google]")
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
        client = genai.Client(api_key=settings.gemini_api_key)
        config = _live_config(types, system_prompt, voice, agent)

        input_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=2)
        barge_in = asyncio.Event()
        latency = PcmuLatency(call_id)
        latency.mark("bridge_connected")

        try:
            async with client.aio.live.connect(
                model=model.replace("models/", ""),
                config=config,
            ) as session:
                log.info(
                    "gemini_pcm.connected",
                    call_id=call_id,
                    preconnected=warm_session is not None,
                    model=model,
                    voice=voice,
                    input_queue_frames=2,
                )
                latency.mark("gemini_ws_connected")
                sender = asyncio.create_task(
                    _send_caller_audio(session, types, input_queue, barge_in, call_id, latency)
                )
                receiver = asyncio.create_task(
                    _receive_model_audio(session, ws, barge_in, call_id, agent, latency)
                )
                reader = asyncio.create_task(_read_pcmside_audio(ws, input_queue, barge_in, call_id, latency))
                done, pending = await asyncio.wait(
                    {sender, receiver, reader}, return_when=asyncio.FIRST_COMPLETED
                )
                for task in pending:
                    task.cancel()
                for task in pending:
                    with suppress(asyncio.CancelledError):
                        await task
                for task in done:
                    task.result()
        except Exception as exc:  # noqa: BLE001
            if settings.low_latency_pcmu_bridge_strict:
                log.exception("gemini_pcm.error", call_id=call_id, error=str(exc))
                with suppress(Exception):
                    await ws.close(code=1011)
            else:
                log.exception("gemini_pcm.error", call_id=call_id, error=str(exc))
                await echo_until_close(ws)
        finally:
            await latency.persist()
            await warm_sessions.cleanup(call_id)


def _live_config(types: Any, system_prompt: str, voice: str, agent: dict[str, Any]) -> dict[str, Any]:
    config: dict[str, Any] = {
        "response_modalities": ["AUDIO"],
        "system_instruction": system_prompt,
        "temperature": settings.gemini_live_temperature,
        "max_output_tokens": settings.gemini_live_max_tokens,
        "speech_config": {
            "voice_config": {
                "prebuilt_voice_config": {"voice_name": voice}
            }
        },
        "realtime_input_config": {
            "automatic_activity_detection": {
                "disabled": False,
                "prefix_padding_ms": settings.gemini_live_vad_prefix_padding_ms,
                "silence_duration_ms": settings.gemini_live_vad_silence_ms,
            }
        },
    }
    declarations = gemini_tool_declarations(agent)
    if declarations:
        config["tools"] = [{"function_declarations": declarations}]
    thinking_config = getattr(types, "ThinkingConfig", None)
    if thinking_config is not None:
        config["thinking_config"] = {"thinking_level": "minimal"}
    return config


async def _read_pcmside_audio(
    ws: WebSocket,
    input_queue: asyncio.Queue[bytes | None],
    barge_in: asyncio.Event,
    call_id: str,
    latency: PcmuLatency,
) -> None:
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if not isinstance(data, (bytes, bytearray)):
                continue
            latency.mark("first_caller_audio")
            barge_in.set()
            for pcmu_chunk in split_pcmu_20ms(bytes(data)):
                pcm16 = pcmu_to_pcm16_16k(pcmu_chunk)
                for pcm_chunk in split_pcm16_16k_20ms(pcm16):
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
    barge_in: asyncio.Event,
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
        barge_in.clear()
    log.info("gemini_pcm.sender_done", call_id=call_id)


async def _receive_model_audio(
    session: Any,
    ws: WebSocket,
    barge_in: asyncio.Event,
    call_id: str,
    agent: dict[str, Any],
    latency: PcmuLatency,
) -> None:
    async for item in _iter_model_output(session, agent, call_id):
        if isinstance(item, dict):
            await session.send_tool_response(function_responses=[item])
            continue
        audio = item
        latency.mark("first_model_audio")
        if barge_in.is_set():
            continue
        for pcm24_chunk in split_pcm16_24k_20ms(audio):
            if barge_in.is_set():
                break
            await ws.send_bytes(pcm16_24k_to_pcmu(pcm24_chunk))
            latency.mark("first_fs_audio_send")
    log.info("gemini_pcm.receiver_done", call_id=call_id)


async def _iter_model_output(session: Any, agent: dict[str, Any], call_id: str) -> AsyncIterator[bytes | dict[str, Any]]:
    async for response in session.receive():
        tool_call = getattr(response, "tool_call", None)
        calls = getattr(tool_call, "function_calls", None) or []
        for call in calls:
            name = str(getattr(call, "name", "") or "")
            args = getattr(call, "args", None) or {}
            call_id_part = str(getattr(call, "id", "") or name)
            result = await execute_agent_tool(agent, call_id=call_id, name=name, arguments=dict(args))
            yield {"id": call_id_part, "name": name, "response": result}
        content = getattr(response, "server_content", None)
        turn = getattr(content, "model_turn", None)
        parts = getattr(turn, "parts", None) or []
        for part in parts:
            inline_data = getattr(part, "inline_data", None)
            data = getattr(inline_data, "data", None)
            if isinstance(data, bytes):
                yield data
