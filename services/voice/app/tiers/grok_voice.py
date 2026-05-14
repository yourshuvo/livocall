from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import AsyncIterator
from contextlib import suppress
from typing import Any

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from app.agent_runtime import build_system_prompt, grok_language, grok_voice, grok_voice_model
from app.audio_codec import split_pcm16_16k_20ms, split_pcmu_20ms
from app.persistence import TranscriptBuffer
from app.settings import settings
from app.tiers._common import echo_until_close, fetch_agent_for_call

log = structlog.get_logger()


class GrokVoiceTier:
    async def run(
        self,
        ws: WebSocket,
        *,
        call_id: str,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
    ) -> None:
        log.info("grok_voice.start", call_id=call_id, agent_id=agent_id)
        if not settings.xai_api_key:
            log.warning("grok_voice.no_key", hint="set XAI_API_KEY to enable Grok Voice")
            await echo_until_close(ws)
            return

        try:
            import websockets  # type: ignore[import-not-found]
        except ImportError:
            log.warning("grok_voice.websockets_missing", hint="uv sync installs websockets")
            await echo_until_close(ws)
            return

        agent = await fetch_agent_for_call(agent_id, call_id)
        system_prompt = _apply_tone(await build_system_prompt(agent, prompt), agent)
        model = grok_voice_model(agent)
        voice = grok_voice(agent)
        language = grok_language(agent)
        use_pcmu = bool(metadata and "_pcmu_bridge_connected_ms" in metadata)
        transcript = TranscriptBuffer(call_id)

        try:
            async with _connect_xai(websockets, model) as xai:
                await xai.send(json.dumps(_session_update(system_prompt, voice, language, use_pcmu)))
                log.info(
                    "grok_voice.connected",
                    call_id=call_id,
                    model=model,
                    voice=voice,
                    language=language,
                    audio_format="audio/pcmu" if use_pcmu else "audio/pcm",
                )

                sender = asyncio.create_task(_send_caller_audio(ws, xai, call_id, use_pcmu))
                receiver = asyncio.create_task(
                    _receive_model_events(xai, ws, transcript, call_id, use_pcmu)
                )
                done, pending = await asyncio.wait(
                    {sender, receiver}, return_when=asyncio.FIRST_COMPLETED
                )
                for task in pending:
                    task.cancel()
                for task in done:
                    exc = task.exception()
                    if exc is not None:
                        raise exc
        except WebSocketDisconnect:
            log.info("grok_voice.disconnected", call_id=call_id)
        except Exception as exc:  # noqa: BLE001
            log.exception("grok_voice.runner_error", error=str(exc), call_id=call_id)
            await echo_until_close(ws)
        finally:
            await transcript.flush()


def _connect_xai(websockets: Any, model: str) -> Any:
    url = f"wss://api.x.ai/v1/realtime?model={model}"
    headers = {"Authorization": f"Bearer {settings.xai_api_key}"}
    try:
        return websockets.connect(url, additional_headers=headers)
    except TypeError:
        return websockets.connect(url, extra_headers=headers)


def _session_update(system_prompt: str, voice: str, language: str, use_pcmu: bool) -> dict[str, Any]:
    input_format: dict[str, Any] = {"type": "audio/pcmu" if use_pcmu else "audio/pcm"}
    output_format: dict[str, Any] = {"type": "audio/pcmu" if use_pcmu else "audio/pcm"}
    if not use_pcmu:
        if settings.grok_voice_audio_format in {"audio/pcm", "audio/pcma", "audio/pcmu"}:
            input_format["type"] = settings.grok_voice_audio_format
            output_format["type"] = settings.grok_voice_audio_format
        else:
            input_format["type"] = "audio/pcm"
            output_format["type"] = "audio/pcm"
        if input_format["type"] == "audio/pcm":
            input_format["rate"] = settings.grok_voice_audio_rate
            output_format["rate"] = settings.grok_voice_audio_rate
    return {
        "type": "session.update",
        "session": {
            "voice": voice,
            "instructions": _language_instructions(system_prompt, language),
            "turn_detection": {
                "type": "server_vad",
                "threshold": settings.grok_voice_vad_threshold,
                "silence_duration_ms": settings.grok_voice_vad_silence_ms,
                "prefix_padding_ms": settings.grok_voice_vad_prefix_padding_ms,
            },
            "audio": {
                "input": {"format": input_format},
                "output": {"format": output_format},
            },
        },
    }


def _language_instructions(system_prompt: str, language: str) -> str:
    if not language:
        return system_prompt
    return (
        f"{system_prompt}\n\nLanguage preference: respond naturally in {language}. "
        "If the caller uses another supported language, detect it and match them."
    )


def _apply_tone(system_prompt: str, agent: dict[str, Any]) -> str:
    voice = agent.get("voice") if isinstance(agent.get("voice"), dict) else {}
    tone = str(voice.get("style") or "").strip()
    if not tone:
        return system_prompt
    return f"{system_prompt}\n\nVoice tone: {tone}. Keep the same tone throughout the call."


async def _send_caller_audio(ws: WebSocket, xai: Any, call_id: str, use_pcmu: bool) -> None:
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                return
            data = msg.get("bytes")
            if isinstance(data, (bytes, bytearray)):
                audio = bytes(data)
                await xai.send(
                    json.dumps(
                        {
                            "type": "input_audio_buffer.append",
                            "audio": base64.b64encode(audio).decode("ascii"),
                        }
                    )
                )
                continue
            text = msg.get("text")
            if isinstance(text, str):
                log.info("grok_voice.ws_text", call_id=call_id, value=text[:200])
    except WebSocketDisconnect:
        return


async def _receive_model_events(
    xai: Any,
    ws: WebSocket,
    transcript: TranscriptBuffer,
    call_id: str,
    use_pcmu: bool,
) -> None:
    agent_transcript = []
    async for raw in _messages(xai):
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("grok_voice.bad_event", call_id=call_id)
            continue
        event_type = str(event.get("type") or "")
        if event_type == "response.output_audio.delta":
            delta = str(event.get("delta") or "")
            if delta:
                await _send_audio_delta(ws, delta, use_pcmu)
        elif event_type == "response.output_audio_transcript.delta":
            delta = str(event.get("delta") or "")
            if delta:
                agent_transcript.append(delta)
        elif event_type == "response.output_audio_transcript.done":
            text = str(event.get("transcript") or "".join(agent_transcript))
            agent_transcript.clear()
            await transcript.add("agent", text)
        elif event_type == "conversation.item.input_audio_transcription.completed":
            await transcript.add("user", str(event.get("transcript") or ""))
        elif event_type == "error":
            log.warning("grok_voice.error_event", call_id=call_id, event=event)


async def _messages(xai: Any) -> AsyncIterator[str]:
    async for raw in xai:
        if isinstance(raw, bytes):
            yield raw.decode("utf-8")
        else:
            yield str(raw)


async def _send_audio_delta(ws: WebSocket, delta: str, use_pcmu: bool) -> None:
    audio = base64.b64decode(delta)
    frames = split_pcmu_20ms(audio) if use_pcmu else split_pcm16_16k_20ms(audio)
    for frame in frames:
        with suppress(WebSocketDisconnect):
            await ws.send_bytes(frame)
