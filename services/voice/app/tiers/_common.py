"""Shared helpers for tier runners.

`mod_audio_fork` connects to /ws/audio with raw L16/16k PCM frames in both
directions. Each tier expects:

  * inbound  bytes  → caller's audio (PCM s16le, 16 kHz, mono)
  * outbound bytes  → AI / TTS audio in the same format (FreeSWITCH resamples
    if the trunk needs a different codec)
  * inbound  text   → control messages (keepalive, DTMF events, hangup hints)

The fake-driver fallback echoes inbound audio back so end-to-end tests pass
without paid AI keys.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog
from fastapi import WebSocket, WebSocketDisconnect

log = structlog.get_logger()


async def echo_until_close(ws: WebSocket) -> None:
    """Echo inbound audio bytes back to the caller. Used as the no-keys fallback."""
    try:
        while True:
            msg = await ws.receive()
            t = msg.get("type")
            if t == "websocket.disconnect":
                return
            data = msg.get("bytes")
            if isinstance(data, (bytes, bytearray)):
                await ws.send_bytes(bytes(data))
            else:
                text = msg.get("text")
                if isinstance(text, str):
                    log.info("ws.text", value=text[:200])
    except WebSocketDisconnect:
        return


async def send_json(ws: WebSocket, payload: dict[str, Any]) -> None:
    try:
        await ws.send_text(json.dumps(payload))
    except Exception as exc:  # noqa: BLE001
        log.warning("ws.send_json_failed", error=str(exc))


async def fetch_agent(agent_id: str) -> dict[str, Any]:
    """Pull the agent doc from Mongo (best-effort). Empty dict if unavailable."""
    try:
        from bson import ObjectId

        from app.db import get_db

        if not ObjectId.is_valid(agent_id):
            return {}
        doc = await get_db()["agents"].find_one({"_id": ObjectId(agent_id)})
        return dict(doc) if doc else {}
    except Exception as exc:  # noqa: BLE001
        log.warning("agent.lookup_failed", error=str(exc))
        return {}


async def fetch_agent_for_call(agent_id: str, call_id: str) -> dict[str, Any]:
    agent = await fetch_agent(agent_id)
    try:
        from app.runtime_overrides import runtime_overrides

        overrides = await runtime_overrides.peek(call_id)
    except Exception as exc:  # noqa: BLE001
        log.warning("agent.overrides_failed", error=str(exc), call_id=call_id)
        return agent
    if isinstance(overrides.get("tools"), list):
        agent["tools"] = overrides["tools"]
    return agent


async def race_with_disconnect(ws: WebSocket, coro: asyncio.Future[Any] | asyncio.Task[Any]) -> None:
    """Run ``coro`` until either it finishes or the websocket disconnects."""

    async def _watch() -> None:
        try:
            while True:
                msg = await ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    return
        except WebSocketDisconnect:
            return

    watcher = asyncio.create_task(_watch())
    try:
        done, _ = await asyncio.wait({watcher, coro}, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            exc = t.exception() if isinstance(t, asyncio.Task) else None
            if exc is not None:
                log.warning("ws.task_error", error=str(exc))
    finally:
        if not watcher.done():
            watcher.cancel()
        if isinstance(coro, asyncio.Task) and not coro.done():
            coro.cancel()
