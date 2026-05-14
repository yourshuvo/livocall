"""Tier 3 — DTMF / IVR with cached Gemini-TTS prompts.

For T3 the dialplan owns most of the call flow via `play_and_get_digits`, but
this WS endpoint is invoked when an agent opts into a "free-form clarify"
sub-flow: a 5-second audio capture is sent in, we transcribe it with
Deepgram (one-shot), classify the intent with Gemini Flash, and return the
DTMF outcome as a single JSON message before closing.

If keys aren't configured we close cleanly with `{"intent":"unknown"}`.
"""

from __future__ import annotations

import asyncio

import structlog
from fastapi import WebSocket

from app.settings import settings
from app.tiers._common import fetch_agent_for_call, send_json

log = structlog.get_logger()

CAPTURE_SECONDS = 5
MIN_CAPTURE_SECONDS = 1.2
SILENCE_END_MS = 700
SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2  # PCM s16le


class DtmfTier:
    async def run(
        self,
        ws: WebSocket,
        *,
        call_id: str,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
    ) -> None:
        log.info("tier3.start", call_id=call_id, agent_id=agent_id)
        agent = await fetch_agent_for_call(agent_id, call_id)
        dtmf = agent.get("dtmf") if isinstance(agent.get("dtmf"), dict) else {}
        menu = [m for m in dtmf.get("menu") or [] if isinstance(m, dict)]

        if not (settings.deepgram_api_key and settings.gemini_api_key):
            await send_json(ws, {"intent": "unknown", "menu": _menu_payload(menu), "reason": "tier3 unconfigured"})
            await ws.close(code=1000)
            return

        # Capture up to CAPTURE_SECONDS of audio, but return as soon as the
        # caller has stopped talking so the clarify flow does not wait a fixed
        # five seconds on every turn.
        target_bytes = SAMPLE_RATE * BYTES_PER_SAMPLE * CAPTURE_SECONDS
        min_bytes = int(SAMPLE_RATE * BYTES_PER_SAMPLE * MIN_CAPTURE_SECONDS)
        silence_bytes = int(SAMPLE_RATE * BYTES_PER_SAMPLE * SILENCE_END_MS / 1000)
        buf = bytearray()
        trailing_silence = 0
        try:
            while len(buf) < target_bytes:
                msg = await asyncio.wait_for(ws.receive(), timeout=CAPTURE_SECONDS + 2)
                if msg.get("type") == "websocket.disconnect":
                    break
                data = msg.get("bytes")
                if isinstance(data, (bytes, bytearray)):
                    chunk = bytes(data)
                    buf.extend(chunk)
                    if _is_silence(chunk):
                        trailing_silence += len(chunk)
                    else:
                        trailing_silence = 0
                    if len(buf) >= min_bytes and trailing_silence >= silence_bytes:
                        break
        except TimeoutError:
            log.info("tier3.capture_timeout", got=len(buf))

        if not buf:
            await send_json(ws, {"intent": "unknown", "reason": "no audio"})
            await ws.close(code=1000)
            return

        try:
            transcript = await _deepgram_transcribe(bytes(buf))
            intent = await _gemini_classify(transcript, _classification_prompt(prompt, menu), menu)
            action = _resolve_action(intent, menu)
            await send_json(ws, {"intent": intent, "action": action, "menu": _menu_payload(menu), "transcript": transcript})
        except Exception as exc:  # noqa: BLE001
            log.exception("tier3.error", error=str(exc))
            await send_json(ws, {"intent": "unknown", "error": str(exc)})
        finally:
            await ws.close(code=1000)


async def _deepgram_transcribe(pcm: bytes) -> str:
    import httpx

    headers = {
        "Authorization": f"Token {settings.deepgram_api_key}",
        "Content-Type": "audio/raw",
    }
    params = {
        "model": settings.deepgram_model,
        "encoding": "linear16",
        "sample_rate": str(SAMPLE_RATE),
        "language": settings.deepgram_language,
        "smart_format": "true",
        "endpointing": "250",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            "https://api.deepgram.com/v1/listen",
            params=params,
            headers=headers,
            content=pcm,
        )
        r.raise_for_status()
        body = r.json()
        return (
            body.get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [{}])[0]
            .get("transcript", "")
        )


async def _gemini_classify(transcript: str, prompt: str, menu: list[dict[str, object]] | None = None) -> str:
    import httpx

    instruction = (
        prompt
        or "Classify this utterance into ONE of: yes, no, repeat, agent, unknown. Reply with the bare label."
    )
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{instruction}\n\nUtterance: {transcript!r}"}],
            }
        ],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 8},
    }
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{settings.pipeline_llm_model}:generateContent"
        f"?key={settings.gemini_api_key}"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        data = r.json()
    text = ""
    for cand in data.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            text += part.get("text", "")
    text = text.strip().lower()
    valid = {"yes", "no", "repeat", "agent", "unknown"} | {
        str(m.get("key") or "").lower() for m in (menu or []) if str(m.get("key") or "")
    }
    return text if text in valid else "unknown"


def _classification_prompt(prompt: str, menu: list[dict[str, object]]) -> str:
    if prompt:
        return prompt
    if not menu:
        return "Classify this utterance into ONE of: yes, no, repeat, agent, unknown. Reply with the bare label."
    labels = ", ".join(f"{m.get('key')}={m.get('label')}" for m in menu)
    keys = ", ".join(str(m.get("key")) for m in menu)
    return (
        f"Classify the caller utterance into one menu key or unknown. Menu: {labels}. "
        f"Reply with exactly one of: {keys}, unknown."
    )


def _resolve_action(intent: str, menu: list[dict[str, object]]) -> str:
    for item in menu:
        if str(item.get("key") or "") == intent:
            return str(item.get("action") or "")
    if intent == "agent":
        for item in menu:
            action = str(item.get("action") or "")
            if action.startswith("transfer:"):
                return action
    return ""


def _menu_payload(menu: list[dict[str, object]]) -> list[dict[str, str]]:
    return [
        {
            "key": str(item.get("key") or ""),
            "label": str(item.get("label") or ""),
            "action": str(item.get("action") or ""),
        }
        for item in menu
    ]


def _is_silence(chunk: bytes) -> bool:
    if not chunk:
        return True
    samples = [
        int.from_bytes(chunk[i : i + 2], byteorder="little", signed=True)
        for i in range(0, len(chunk) - 1, 2)
    ]
    if not samples:
        return True
    avg_abs = sum(abs(s) for s in samples) / len(samples)
    return avg_abs < 180


__all__ = ["DtmfTier"]
