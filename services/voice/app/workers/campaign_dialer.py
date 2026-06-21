"""Outbound campaign dialer.

Polls running campaigns, respects concurrency / call-windows / retry / DNC,
and originates calls one contact at a time.

Persistence model (collections written to by the Next.js side):

  campaigns       — Campaign docs (orgId, agentId, contactIds, status, ...)
  contacts        — Contact docs (orgId, e164, name, tags, ...)
  campaign_attempts — created here; tracks attempts per (campaignId, contactId)
  dnc            — DNC entries (orgId, e164)

The worker is intentionally single-instance and uses an `inflight` field on
the campaign doc so a second runner couldn't double-dial the same contact.
"""

from __future__ import annotations

import asyncio
import contextlib
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from bson import ObjectId

from app import originator
from app.db import get_db
from app.leader import LeaderLock
from app.settings import settings

log = structlog.get_logger()


def _now() -> datetime:
    return datetime.now(UTC)


def _is_in_window(now_utc: datetime, schedule: dict[str, Any]) -> bool:
    windows = schedule.get("windows") or [{"from": 540, "to": 1080}]
    tz_name = schedule.get("timezone") or "Asia/Dhaka"
    try:
        # Use stdlib zoneinfo
        from zoneinfo import ZoneInfo

        local = now_utc.astimezone(ZoneInfo(tz_name))
    except Exception:
        local = now_utc
    minutes = local.hour * 60 + local.minute
    for w in windows:
        f, t = int(w.get("from", 0)), int(w.get("to", 0))
        if f == t:
            continue
        if f < t:
            if f <= minutes < t:
                return True
        else:
            if minutes >= f or minutes < t:
                return True
    return False


def _is_in_schedule(now_utc: datetime, schedule: dict[str, Any]) -> bool:
    start = schedule.get("startAt")
    end = schedule.get("endAt")
    if start and now_utc < (start if isinstance(start, datetime) else _now()):
        return False
    if end and now_utc > (end if isinstance(end, datetime) else _now()):
        return False
    return _is_in_window(now_utc, schedule)


class CampaignDialer:
    def __init__(self, poll_interval_seconds: float = 5.0) -> None:
        self.poll_interval = poll_interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._run(), name="campaign-dialer")
            log.info("campaign_dialer.started", interval_s=self.poll_interval)

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            with contextlib.suppress(asyncio.CancelledError):
                await asyncio.wait_for(self._task, timeout=5.0)
            self._task = None
        log.info("campaign_dialer.stopped")

    async def _run(self) -> None:
        while not self._stop.is_set():
            async with LeaderLock("campaign-dialer", ttl_seconds=30) as lock:
                if not lock.held:
                    # another replica is the leader — idle a bit and retry.
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(
                            self._stop.wait(), timeout=max(5.0, self.poll_interval * 2)
                        )
                    continue
                while lock.held and not self._stop.is_set():
                    try:
                        await self._tick()
                    except Exception:  # noqa: BLE001
                        log.exception("campaign_dialer.tick_error")
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(
                            self._stop.wait(), timeout=self.poll_interval
                        )

    async def _tick(self) -> None:
        db = get_db()
        cursor = db["campaigns"].find({"status": "running"})
        async for camp in cursor:
            await self._process_campaign(camp)

    async def _process_campaign(self, camp: dict[str, Any]) -> None:
        db = get_db()
        cid = camp["_id"]
        if not _is_in_schedule(_now(), dict(camp.get("schedule") or {})):
            return

        concurrency = max(1, int(camp.get("concurrency") or 1))
        # How many calls this campaign currently has in flight
        inflight = await db["campaign_attempts"].count_documents(
            {"campaignId": cid, "status": "in_progress"}
        )
        slots = max(0, concurrency - inflight)
        if slots == 0:
            return

        max_attempts = int(camp.get("maxAttempts") or 2)
        contact_ids = list(camp.get("contactIds") or [])
        if not contact_ids:
            await self._maybe_finish(camp)
            return

        # Pick contacts that are eligible for another attempt
        attempts_by_contact = {}
        async for a in db["campaign_attempts"].find(
            {"campaignId": cid, "contactId": {"$in": contact_ids}}
        ):
            attempts_by_contact[a["contactId"]] = a

        for contact_id in contact_ids:
            if slots <= 0:
                break
            prev = attempts_by_contact.get(contact_id)
            if prev:
                if prev["status"] in ("completed", "failed_terminal"):
                    continue
                if (prev.get("attempts") or 0) >= max_attempts:
                    await db["campaign_attempts"].update_one(
                        {"campaignId": camp["_id"], "contactId": contact_id},
                        {
                            "$set": {
                                "status": "failed_terminal",
                                "lastReason": "max_attempts",
                                "updatedAt": _now(),
                            }
                        },
                    )
                    continue
                next_retry = prev.get("nextRetryAt")
                if isinstance(next_retry, datetime) and next_retry > _now():
                    continue
            ok = await self._dial_contact(camp, contact_id, prev)
            if ok:
                slots -= 1

        await self._maybe_finish(camp)

    async def _dial_contact(
        self,
        camp: dict[str, Any],
        contact_id: ObjectId,
        prev: dict[str, Any] | None,
    ) -> bool:
        db = get_db()
        contact = await db["contacts"].find_one({"_id": contact_id})
        if not contact or not contact.get("e164"):
            return False

        # DNC check
        if await db["dncentries"].find_one({"orgId": camp["orgId"], "e164": contact["e164"]}):
            await db["campaign_attempts"].update_one(
                {"campaignId": camp["_id"], "contactId": contact_id},
                {
                    "$setOnInsert": {"campaignId": camp["_id"], "contactId": contact_id},
                    "$set": {"status": "failed_terminal", "lastReason": "dnc", "updatedAt": _now()},
                    "$inc": {"attempts": 1},
                },
                upsert=True,
            )
            await db["campaigns"].update_one(
                {"_id": camp["_id"]}, {"$inc": {"stats.failed": 1, "stats.attempted": 1}}
            )
            return False

        agent = await db["agents"].find_one({"_id": camp["agentId"]})
        if not agent:
            return False
        tier = str(agent.get("tier") or "pipeline")

        try:
            res = await originator.originate_call(
                agent_id=str(camp["agentId"]),
                to_e164=str(contact["e164"]),
                tier=tier,
                from_e164=str(camp.get("fromE164") or "") or None,
                metadata={"campaign_id": str(camp["_id"]), "contact_id": str(contact_id)},
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("campaign_dialer.originate_failed", error=str(exc))
            await db["campaign_attempts"].update_one(
                {"campaignId": camp["_id"], "contactId": contact_id},
                {
                    "$setOnInsert": {"campaignId": camp["_id"], "contactId": contact_id},
                    "$set": {
                        "status": "failed",
                        "lastReason": str(exc)[:200],
                        "nextRetryAt": _now() + timedelta(minutes=15),
                        "updatedAt": _now(),
                    },
                    "$inc": {"attempts": 1},
                },
                upsert=True,
            )
            return False

        await db["campaign_attempts"].update_one(
            {"campaignId": camp["_id"], "contactId": contact_id},
            {
                "$setOnInsert": {"campaignId": camp["_id"], "contactId": contact_id},
                "$set": {
                    "status": "in_progress",
                    "callId": res.get("callId"),
                    "edgeUuid": res.get("edgeUuid"),
                    "updatedAt": _now(),
                },
                "$inc": {"attempts": 1},
            },
            upsert=True,
        )
        await db["campaigns"].update_one(
            {"_id": camp["_id"]}, {"$inc": {"stats.attempted": 1}}
        )
        return True

    async def _maybe_finish(self, camp: dict[str, Any]) -> None:
        db = get_db()
        contact_ids = list(camp.get("contactIds") or [])
        if not contact_ids:
            return
        finished = await db["campaign_attempts"].count_documents(
            {
                "campaignId": camp["_id"],
                "contactId": {"$in": contact_ids},
                "status": {"$in": ["completed", "failed_terminal"]},
            }
        )
        if finished >= len(contact_ids):
            await db["campaigns"].update_one(
                {"_id": camp["_id"]}, {"$set": {"status": "completed", "updatedAt": _now()}}
            )
            log.info("campaign_dialer.completed", campaign_id=str(camp["_id"]))


_singleton: CampaignDialer | None = None


def get_dialer() -> CampaignDialer:
    global _singleton
    if _singleton is None:
        _singleton = CampaignDialer(
            poll_interval_seconds=settings.campaign_poll_interval_seconds,
        )
    return _singleton
