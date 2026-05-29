"""Tier 1: Gemini Live over 16 kHz PCM WebSockets."""

from __future__ import annotations

import structlog
from fastapi import WebSocket

from app.gemini_pcm_bridge import GeminiPcmBridge

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
        await GeminiPcmBridge(wire_format="pcm16").run(
            ws,
            call_id=call_id,
            agent_id=agent_id,
            prompt=prompt,
            metadata=metadata,
        )
