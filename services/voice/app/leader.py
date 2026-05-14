"""Redis-backed leader lock.

Multiple voice-service replicas can start in a cluster but only one should
actually run the campaign dialer, KB ingestion, or webhook tick loop. This
module provides a small `LeaderLock` context manager that acquires a Redis
key with `SET key id NX EX <ttl>` and refreshes it while held.

When Redis is not configured (``REDIS_URL`` empty) the lock degrades into a
no-op that always claims leadership — keeps single-box / dev loops working
exactly as before Slice 5.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import uuid
from typing import Any

import structlog

from app.settings import settings

log = structlog.get_logger()


class _NoopLock:
    """Single-process fallback when Redis is unavailable."""

    def __init__(self, key: str) -> None:
        self.key = key
        self.held = True

    async def __aenter__(self) -> _NoopLock:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        self.held = False


class LeaderLock:
    """Async context manager that holds a Redis lock while in-scope.

    Usage::

        async with LeaderLock("campaign-dialer", ttl_seconds=30) as lock:
            if not lock.held:
                return  # another replica is the leader
            while True:
                await do_work()
                await asyncio.sleep(5)

    The lock automatically refreshes every ``ttl_seconds/3``. If refresh ever
    fails (Redis flap, manual DEL), ``lock.held`` flips to False and the
    caller is expected to bail out of its loop on the next iteration.
    """

    _UNLOCK = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
    """
    _REFRESH = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
    """

    def __init__(self, key: str, ttl_seconds: int = 30) -> None:
        self.key = f"livocall:lock:{key}"
        self.ttl = ttl_seconds
        self.held: bool = False
        self._id = uuid.uuid4().hex
        self._refresh_task: asyncio.Task[None] | None = None
        self._client: Any = None

    async def __aenter__(self) -> LeaderLock:
        redis_url = os.environ.get("REDIS_URL") or settings.redis_url
        if not redis_url:
            log.info("leader.noop", key=self.key)
            self.held = True
            return self
        try:
            import redis.asyncio as aioredis  # type: ignore[import-untyped]
        except Exception:  # pragma: no cover — import guard
            log.warning("leader.redis_missing", key=self.key)
            self.held = True
            return self
        self._client = aioredis.from_url(redis_url, decode_responses=True)
        ok = await self._client.set(self.key, self._id, nx=True, ex=self.ttl)
        self.held = bool(ok)
        if self.held:
            self._refresh_task = asyncio.create_task(self._refresh_loop())
            log.info("leader.acquired", key=self.key, id=self._id)
        else:
            log.info("leader.not_leader", key=self.key)
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._refresh_task:
            self._refresh_task.cancel()
            self._refresh_task = None
        if self.held and self._client is not None:
            try:
                await self._client.eval(self._UNLOCK, 1, self.key, self._id)
            except Exception:  # noqa: BLE001
                log.exception("leader.unlock_error", key=self.key)
        if self._client is not None:
            with contextlib.suppress(Exception):
                await self._client.aclose()
        self.held = False

    async def _refresh_loop(self) -> None:
        interval = max(1, self.ttl // 3)
        while self.held and self._client is not None:
            try:
                await asyncio.sleep(interval)
                ok = await self._client.eval(
                    self._REFRESH, 1, self.key, self._id, str(self.ttl)
                )
                if not ok:
                    self.held = False
                    log.warning("leader.lost", key=self.key)
                    return
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001
                log.exception("leader.refresh_error", key=self.key)
                # keep trying — flaps shouldn't release the lock instantly
