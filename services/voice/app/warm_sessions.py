from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import structlog

from app.agent_runtime import build_system_prompt, gemini_live_model, gemini_voice
from app.gemini_live_config import live_config
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
    voice: str = field(default_factory=lambda: settings.gemini_live_voice)
    system_prompt: str = ""
    pcm_format: str = "s16le/16000/mono"
    outbound_format: str = "s16le/24000/mono"
    live_context: Any | None = None
    live_session: Any | None = None
    preconnected: bool = False

    async def close(self) -> None:
        context = self.live_context
        self.live_context = None
        self.live_session = None
        self.preconnected = False
        if context is None:
            return
        exit_fn = getattr(context, "__aexit__", None)
        if exit_fn is None:
            close_fn = getattr(context, "aclose", None)
            if close_fn is not None:
                await close_fn()
            return
        await exit_fn(None, None, None)


class WarmSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, WarmGeminiSession] = {}
        self._pending: dict[str, asyncio.Task[WarmGeminiSession]] = {}
        self._lock = asyncio.Lock()

    async def begin_prepare(
        self,
        call_id: str,
        *,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
        agent: dict[str, Any] | None = None,
    ) -> asyncio.Task[WarmGeminiSession]:
        async with self._lock:
            previous = self._pending.pop(call_id, None)
            existing = self._sessions.pop(call_id, None)
            task = asyncio.create_task(
                self.prepare(
                    call_id,
                    agent_id=agent_id,
                    prompt=prompt,
                    metadata=metadata,
                    agent=agent,
                    store=False,
                )
            )
            self._pending[call_id] = task
        if previous is not None and not previous.done():
            previous.cancel()
        if existing is not None:
            await existing.close()

        async def store_or_log(done: asyncio.Task[WarmGeminiSession]) -> None:
            try:
                session = done.result()
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                log.warning("gemini.preconnect.failed", call_id=call_id, error=str(exc))
                return
            if self._expired(session):
                await session.close()
                return
            async with self._lock:
                current = self._pending.get(call_id)
                if current is done:
                    self._sessions[call_id] = session
                    self._pending.pop(call_id, None)
                elif current is None:
                    return
                else:
                    await session.close()

        async def callback(done: asyncio.Task[WarmGeminiSession]) -> None:
            await store_or_log(done)

        def schedule_callback(done: asyncio.Task[WarmGeminiSession]) -> None:
            asyncio.create_task(callback(done))

        task.add_done_callback(schedule_callback)

        return task

    async def prepare(
        self,
        call_id: str,
        *,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
        agent: dict[str, Any] | None = None,
        store: bool = True,
    ) -> WarmGeminiSession:
        async with self._lock:
            existing = self._sessions.get(call_id)
            if existing is not None and not self._expired(existing):
                return existing

        resolved_agent = agent or await fetch_agent_for_call(agent_id, call_id)
        model = gemini_live_model(resolved_agent)
        voice = gemini_voice(resolved_agent)
        system_prompt = await build_system_prompt(resolved_agent, prompt)
        session = WarmGeminiSession(
            call_id=call_id,
            agent_id=agent_id,
            prompt=prompt,
            metadata=metadata or {},
            agent=resolved_agent,
            model=model,
            voice=voice,
            system_prompt=system_prompt,
        )
        if settings.gemini_api_key:
            try:
                from google.genai import types  # type: ignore[import-not-found]

                config = live_config(types, system_prompt, voice, resolved_agent)
                context, live_session = await _open_live_session(model=model, config=config)
                session.live_context = context
                session.live_session = live_session
                session.preconnected = True
            except ImportError as exc:
                log.warning(
                    "gemini.preconnect.google_genai_missing",
                    call_id=call_id,
                    hint="install pipecat-ai[google]",
                    error=str(exc),
                )
            except Exception:
                await session.close()
                raise
        else:
            log.warning("gemini.preconnect.no_key", call_id=call_id, hint="set GEMINI_API_KEY")
        if store:
            async with self._lock:
                self._sessions[call_id] = session
        log.info(
            "gemini.preconnect.prepared",
            call_id=call_id,
            agent_id=agent_id,
            model=session.model,
            pcm_format=session.pcm_format,
            preconnected=session.preconnected,
        )
        return session

    async def pop(self, call_id: str) -> WarmGeminiSession | None:
        async with self._lock:
            session = self._sessions.pop(call_id, None)
            pending = self._pending.pop(call_id, None)
        if session is None and pending is not None:
            if pending.done():
                try:
                    session = pending.result()
                except asyncio.CancelledError:
                    session = None
                except Exception as exc:  # noqa: BLE001
                    log.warning("gemini.preconnect.pending_failed", call_id=call_id, error=str(exc))
                    session = None
            else:
                pending.cancel()
        if session is None or self._expired(session):
            if session is not None:
                await session.close()
            return None
        log.info("gemini.preconnect.attached", call_id=call_id, preconnected=session.preconnected)
        return session

    async def cleanup(self, call_id: str) -> None:
        async with self._lock:
            session = self._sessions.pop(call_id, None)
            pending = self._pending.pop(call_id, None)
        if pending is not None and not pending.done():
            pending.cancel()
        elif pending is not None:
            try:
                pending_session = pending.result()
            except asyncio.CancelledError:
                pending_session = None
            except Exception as exc:  # noqa: BLE001
                log.warning("gemini.preconnect.cleanup_failed", call_id=call_id, error=str(exc))
                pending_session = None
            if pending_session is not None:
                await pending_session.close()
        if session is not None:
            await session.close()

    async def reap_expired(self) -> int:
        async with self._lock:
            expired = [call_id for call_id, session in self._sessions.items() if self._expired(session)]
            sessions = [self._sessions.pop(call_id) for call_id in expired]
        for session in sessions:
            await session.close()
            log.info("gemini.preconnect.expired", call_id=session.call_id)
        return len(expired)

    def _expired(self, session: WarmGeminiSession) -> bool:
        age = (datetime.now(UTC) - session.prepared_at).total_seconds()
        return age > settings.gemini_preconnect_ttl_seconds


async def _open_live_session(*, model: str, config: dict[str, Any]) -> tuple[Any, Any]:
    from google import genai  # type: ignore[import-not-found]

    client = genai.Client(api_key=settings.gemini_api_key)
    context = client.aio.live.connect(model=model.replace("models/", ""), config=config)
    live_session = await context.__aenter__()
    return context, live_session


warm_sessions = WarmSessionManager()
