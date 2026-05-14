"""Webhook delivery scheduler.

Periodically POSTs ``/api/internal/webhook-tick`` on the Next.js web app,
which drains pending ``WebhookDelivery`` docs. A single leader runs the
ticker so a fleet of voice replicas doesn't stampede the web app.

The leader lock (see :mod:`app.leader`) transparently no-ops when Redis
isn't configured, so this works in single-box dev too.
"""

from __future__ import annotations

import asyncio
import contextlib

import httpx
import structlog

from app.leader import LeaderLock
from app.settings import settings

log = structlog.get_logger()


class WebhookScheduler:
    def __init__(self, poll_interval_seconds: float = 30.0) -> None:
        self.poll_interval = poll_interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._run(), name="webhook-scheduler")
            log.info("webhook_scheduler.started", interval_s=self.poll_interval)

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            with contextlib.suppress(asyncio.CancelledError):
                await asyncio.wait_for(self._task, timeout=5.0)
            self._task = None
        log.info("webhook_scheduler.stopped")

    async def _run(self) -> None:
        while not self._stop.is_set():
            async with LeaderLock("webhook-scheduler", ttl_seconds=60) as lock:
                if not lock.held:
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(
                            self._stop.wait(),
                            timeout=max(15.0, self.poll_interval * 2),
                        )
                    continue
                while lock.held and not self._stop.is_set():
                    try:
                        await self._tick()
                    except Exception:  # noqa: BLE001
                        log.exception("webhook_scheduler.tick_error")
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(
                            self._stop.wait(), timeout=self.poll_interval
                        )

    async def _tick(self) -> None:
        if not settings.web_shared_secret:
            log.debug("webhook_scheduler.skip", reason="no_shared_secret")
            return
        url = f"{settings.web_base_url.rstrip('/')}/api/internal/webhook-tick"
        headers = {"authorization": f"Bearer {settings.web_shared_secret}"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, headers=headers)
            if r.status_code >= 400:
                log.warning(
                    "webhook_scheduler.tick_http_error",
                    status=r.status_code,
                    body=r.text[:200],
                )
            else:
                try:
                    payload = r.json()
                    log.info(
                        "webhook_scheduler.tick_ok",
                        delivered=payload.get("delivered", 0),
                    )
                except Exception:  # noqa: BLE001
                    log.info("webhook_scheduler.tick_ok")


_singleton: WebhookScheduler | None = None


def get_scheduler() -> WebhookScheduler:
    global _singleton
    if _singleton is None:
        _singleton = WebhookScheduler()
    return _singleton
