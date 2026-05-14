from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import structlog

from app.agent_runtime import gemini_live_model
from app.settings import settings
from app.tiers._common import fetch_agent_for_call

log = structlog.get_logger()


@dataclass
class WarmGeminiSession:
    call_id: str
    agent_id: str
    prompt: str
    metadata: dict[str, str]
    prepared_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    agent: dict[str, Any] = field(default_factory=dict)
    model: str = field(default_factory=lambda: settings.gemini_live_model)
    pcm_format: str = "s16le/16000/mono"
    outbound_format: str = "s16le/24000/mono"


class WarmSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, WarmGeminiSession] = {}
        self._lock = asyncio.Lock()

    async def prepare(
        self,
        call_id: str,
        *,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
    ) -> WarmGeminiSession:
        async with self._lock:
            existing = self._sessions.get(call_id)
            if existing is not None and not self._expired(existing):
                return existing

        agent = await fetch_agent_for_call(agent_id, call_id)
        session = WarmGeminiSession(
            call_id=call_id,
            agent_id=agent_id,
            prompt=prompt,
            metadata=metadata or {},
            agent=agent,
            model=gemini_live_model(agent),
        )
        async with self._lock:
            self._sessions[call_id] = session
        log.info(
            "gemini.preconnect.prepared",
            call_id=call_id,
            agent_id=agent_id,
            model=session.model,
            pcm_format=session.pcm_format,
        )
        return session

    async def pop(self, call_id: str) -> WarmGeminiSession | None:
        async with self._lock:
            session = self._sessions.pop(call_id, None)
        if session is None or self._expired(session):
            return None
        log.info("gemini.preconnect.attached", call_id=call_id)
        return session

    async def cleanup(self, call_id: str) -> None:
        async with self._lock:
            self._sessions.pop(call_id, None)

    async def reap_expired(self) -> int:
        async with self._lock:
            expired = [call_id for call_id, session in self._sessions.items() if self._expired(session)]
            for call_id in expired:
                self._sessions.pop(call_id, None)
        for call_id in expired:
            log.info("gemini.preconnect.expired", call_id=call_id)
        return len(expired)

    def _expired(self, session: WarmGeminiSession) -> bool:
        age = (datetime.now(UTC) - session.prepared_at).total_seconds()
        return age > settings.gemini_preconnect_ttl_seconds


warm_sessions = WarmSessionManager()
