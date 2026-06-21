from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId

from app.db import get_db


async def update_campaign_attempt_for_call(
    doc: dict[str, Any],
    outcome: str,
    ended: datetime,
) -> None:
    """Update campaign-attempt state after any telephony edge completes a call."""
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
