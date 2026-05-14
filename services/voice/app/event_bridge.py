"""Bridges FreeSWITCH ESL events back into the web app's voice-event ingest.

Subscribes to CHANNEL_CREATE / CHANNEL_ANSWER / CHANNEL_HANGUP_COMPLETE /
DTMF events, correlates by ``variable_call_doc_id`` (the FreeSWITCH
channel-variable we set in :func:`EslClient.originate`), and POSTs a
``call.started`` / ``call.completed`` payload to the web app.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog
from bson import ObjectId

from app.billing import compute_cost
from app.db import get_db
from app.esl import EslConfig, EslEvent, EslEventConsumer
from app.originator import execute_ivr_action
from app.persistence import finalize_call
from app.settings import settings
from app.web_client import post_voice_event

log = structlog.get_logger()


def _config() -> EslConfig:
    return EslConfig(
        host=settings.fs_host, port=settings.fs_esl_port, password=settings.fs_esl_password
    )


async def on_event(ev: EslEvent) -> None:
    name = ev.name
    call_doc_id = ev.headers.get("variable_call_doc_id", "")
    if not call_doc_id or not ObjectId.is_valid(call_doc_id):
        return  # not one of ours
    db = get_db()
    if name == "CHANNEL_HANGUP_COMPLETE":
        # Compute duration from FS billsec when present (authoritative — only
        # counts time the call was actually billed for), otherwise fall back
        # to ``now - startedAt``. ``billsec=0`` is a *valid* answer (call was
        # rejected before answer) so we only fall back when the header is
        # missing entirely.
        billsec_raw = ev.headers.get("variable_billsec")
        if billsec_raw is None or billsec_raw == "":
            doc = await db["calls"].find_one({"_id": ObjectId(call_doc_id)})
            if not doc:
                return
            if doc.get("startedAt"):
                started = doc["startedAt"]
                now = datetime.now(UTC)
                duration_sec = max(0, int((now - started).total_seconds()))
            else:
                duration_sec = 0
        else:
            try:
                duration_sec = max(0, int(billsec_raw))
            except ValueError:
                duration_sec = 0
            doc = await db["calls"].find_one({"_id": ObjectId(call_doc_id)})
            if not doc:
                return
        cause = ev.headers.get("Hangup-Cause", "")
        outcome = _outcome_from_cause(cause)
        cost = compute_cost(doc.get("tier", "pipeline"), duration_sec)
        ended = datetime.now(UTC)
        await db["calls"].update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "endedAt": ended,
                    "durationSec": duration_sec,
                    "outcome": outcome,
                    "cost": cost.to_dict(),
                    "hangupCause": cause,
                }
            },
        )
        await _update_campaign_attempt(doc, outcome, ended)
        await post_voice_event(
            {
                "type": "call.completed",
                "callId": call_doc_id,
                "endedAt": ended.isoformat(),
                "durationSec": duration_sec,
                "outcome": outcome,
                "cost": cost.to_dict(),
                "hangupCause": cause,
            }
        )
        # Kick off recording upload + summarization in the background so the
        # ESL consumer stays responsive.
        asyncio.create_task(finalize_call(call_doc_id))
    elif name == "DTMF":
        digit = ev.headers.get("DTMF-Digit", "")
        if not digit:
            return
        # Atomic append via aggregation-pipeline update so concurrent DTMF
        # events from the same channel don't lose digits to a read-modify-write
        # race.
        await db["calls"].update_one(
            {"_id": ObjectId(call_doc_id)},
            [
                {
                    "$set": {
                        "dtmfPath": {
                            "$concat": [
                                {"$ifNull": ["$dtmfPath", ""]},
                                digit,
                            ]
                        }
                    }
                }
            ],
        )
        doc = await db["calls"].find_one({"_id": ObjectId(call_doc_id)})
        if doc:
            await _execute_dtmf_digit(doc, digit)


def _outcome_from_cause(cause: str) -> str:
    if cause in ("NORMAL_CLEARING", "NONE"):
        return "completed"
    if cause in ("NO_ANSWER", "ALLOTTED_TIMEOUT"):
        return "no_answer"
    if cause in ("USER_BUSY",):
        return "busy"
    if cause in ("UNALLOCATED_NUMBER",):
        return "failed"
    if "VOICEMAIL" in cause:
        return "voicemail"
    return "failed"


async def _update_campaign_attempt(doc: dict[str, object], outcome: str, ended: datetime) -> None:
    metadata = doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}
    campaign_id = str(metadata.get("campaign_id") or metadata.get("campaignId") or "")
    contact_id = str(metadata.get("contact_id") or metadata.get("contactId") or "")
    if not (ObjectId.is_valid(campaign_id) and ObjectId.is_valid(contact_id)):
        return
    db = get_db()
    status = "completed" if outcome == "completed" else "failed_terminal"
    await db["campaign_attempts"].update_one(
        {"campaignId": ObjectId(campaign_id), "contactId": ObjectId(contact_id)},
        {
            "$set": {
                "status": status,
                "lastOutcome": outcome,
                "lastReason": outcome,
                "completedAt": ended,
                "updatedAt": ended,
            }
        },
        upsert=False,
    )
    inc: dict[str, int] = {}
    if outcome == "completed":
        inc["stats.completed"] = 1
    elif outcome == "no_answer":
        inc["stats.noAnswer"] = 1
    else:
        inc["stats.failed"] = 1
    await db["campaigns"].update_one(
        {"_id": ObjectId(campaign_id)},
        {"$inc": inc, "$set": {"updatedAt": ended}},
    )


async def _execute_dtmf_digit(doc: dict[str, object], digit: str) -> None:
    db = get_db()
    agent_id = doc.get("agentId")
    if not agent_id:
        return
    agent = await db["agents"].find_one({"_id": agent_id})
    if not agent:
        return
    dtmf = agent.get("dtmf") if isinstance(agent.get("dtmf"), dict) else {}
    for item in dtmf.get("menu") or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("key") or "") != digit:
            continue
        action = str(item.get("action") or "")
        if not action:
            return
        await execute_ivr_action(str(doc["_id"]), action)
        return


async def _accumulate_dtmf(call_doc_id: str, digit: str) -> str:
    db = get_db()
    doc = await db["calls"].find_one({"_id": ObjectId(call_doc_id)})
    prev = (doc or {}).get("dtmfPath", "") if doc else ""
    return f"{prev}{digit}"


_consumer: EslEventConsumer | None = None


def get_consumer() -> EslEventConsumer:
    global _consumer
    if _consumer is None:
        _consumer = EslEventConsumer(config=_config(), callbacks=[on_event])
    return _consumer
