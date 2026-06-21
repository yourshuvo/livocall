"""Outbound and inbound call originator for the embedded PJSIP edge."""

from __future__ import annotations

import uuid as uuid_lib
from datetime import UTC, datetime
from typing import Any

import structlog
from bson import ObjectId

from app import telephony
from app.db import get_db
from app.runtime_overrides import runtime_overrides
from app.settings import settings
from app.warm_sessions import warm_sessions
from app.web_client import post_voice_event

log = structlog.get_logger()


async def resolve_outbound_gateway(
    org_id: str,
    agent_id: str,
    from_e164: str | None,
) -> tuple[str, str]:
    """Pick a PJSIP account slug + the from_e164 to use.

    Strategy:
    1. If from_e164 is provided and that PhoneNumber is outbound-enabled,
       use its providerSlug.
    2. Else pick any outboundEnabled PhoneNumber in the org, preserving the
       requested caller ID when it belongs to the org.
    3. Else fall back to the default PJSIP account and the requested org
       caller ID or settings.default_outbound_caller_id.
    """
    db = get_db()
    org_oid = ObjectId(org_id)
    requested_cli = ""
    if from_e164:
        num = await db["phonenumbers"].find_one({"orgId": org_oid, "e164": from_e164})
        if num:
            requested_cli = str(num.get("e164") or from_e164)
        if num and num.get("outboundEnabled") is True and str(num.get("providerSlug") or ""):
            return num["providerSlug"], num["e164"]
    fallback = await db["phonenumbers"].find_one(
        {"orgId": org_oid, "outboundEnabled": True, "providerSlug": {"$exists": True, "$ne": ""}}
    )
    if fallback:
        return fallback["providerSlug"], requested_cli or fallback["e164"]
    return (
        settings.pjsip_default_account_slug or "sip_custom",
        requested_cli or settings.default_outbound_caller_id,
    )


async def find_org_for_agent(agent_id: str) -> dict[str, Any] | None:
    db = get_db()
    if not ObjectId.is_valid(agent_id):
        return None
    return await db["agents"].find_one({"_id": ObjectId(agent_id)})


async def originate_call(
    *,
    agent_id: str,
    to_e164: str,
    tier: str,
    from_e164: str | None,
    metadata: dict[str, str] | None,
    tools: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Create a Call doc, issue bgapi originate, and return identifiers."""
    db = get_db()
    agent = await find_org_for_agent(agent_id)
    if agent is None:
        raise ValueError(f"agent {agent_id} not found")
    if agent.get("tier") != tier:
        # caller (web) authoritatively sets tier; record both for audit
        log.warning("originate.tier_mismatch", agent_tier=agent.get("tier"), req_tier=tier)
    org_id = str(agent["orgId"])
    gateway, cli = await resolve_outbound_gateway(
        org_id,
        agent_id,
        from_e164,
    )
    org = await db["orgs"].find_one({"_id": agent["orgId"]}) or {}
    disclosure_url = str(org.get("btrcDisclosureAudioUrl") or "")
    recording_consent = str(org.get("recordingConsent") or "optional")
    # Map Org.recordingConsent to livocall_record dialplan var.
    record_mode = {
        "required": "prompt",
        "optional": "on",
        "disabled": "off",
    }.get(recording_consent, "on")
    consent_prompt_url = str(org.get("btrcConsentPromptUrl") or "")

    started_at = datetime.now(UTC)
    # Pre-generate the edge call UUID so callers can hang up or transfer
    # immediately without waiting for SIP callbacks.
    edge_uuid = str(uuid_lib.uuid4())
    call_doc = {
        "orgId": agent["orgId"],
        "agentId": ObjectId(agent_id),
        "direction": "outbound",
        "fromE164": cli,
        "toE164": to_e164,
        "tier": tier,
        "startedAt": started_at,
        "outcome": "in_progress",
        "transcript": [],
        "cost": {"sttPaisa": 0, "llmPaisa": 0, "ttsPaisa": 0, "sipPaisa": 0, "totalPaisa": 0},
        "metadata": metadata or {},
        "latency": {
            "callCreatedAt": started_at.isoformat(),
        },
        "edgeUuid": edge_uuid,
        "createdAt": started_at,
        "updatedAt": started_at,
    }
    inserted = await db["calls"].insert_one(call_doc)
    call_doc_id = str(inserted.inserted_id)
    if tools:
        await runtime_overrides.set(call_doc_id, {"tools": tools})

    if settings.voice_fake_driver:
        edge_uuid = f"fake-{call_doc_id}"
        await db["calls"].update_one(
            {"_id": inserted.inserted_id}, {"$set": {"edgeUuid": edge_uuid}}
        )
        log.info("originate.fake_driver", call_doc_id=call_doc_id, to=to_e164)
    else:
        if settings.gemini_preconnect_enabled and tier == "gemini_live":
            await warm_sessions.begin_prepare(
                call_doc_id,
                agent_id=agent_id,
                prompt="",
                metadata=metadata,
                agent=agent,
            )
        try:
            await telephony.get_edge().originate(
                telephony.OriginateParams(
                    gateway=gateway,
                    to_e164=to_e164,
                    agent_id=agent_id,
                    tier=tier,
                    from_e164=cli,
                    call_doc_id=call_doc_id,
                    channel_uuid=edge_uuid,
                    disclosure_url=disclosure_url,
                    record_mode=record_mode,
                    consent_prompt_url=consent_prompt_url,
                )
            )
        except Exception:
            await warm_sessions.cleanup(call_doc_id)
            raise

    # Notify web (best-effort) so the dashboard can subscribe to call.started.
    await post_voice_event(
        {
            "type": "call.started",
            "callId": call_doc_id,
            "agentId": agent_id,
            "orgId": org_id,
            "edgeUuid": edge_uuid,
            "direction": "outbound",
            "fromE164": cli,
            "toE164": to_e164,
            "tier": tier,
            "startedAt": started_at.isoformat(),
        }
    )

    return {"callId": call_doc_id, "edgeUuid": edge_uuid, "queued": True}


async def create_inbound_call(
    *,
    did_e164: str,
    caller_e164: str,
    edge_uuid: str,
    metadata: dict[str, str] | None = None,
) -> dict[str, Any]:
    db = get_db()
    num = await db["phonenumbers"].find_one(
        {"e164": did_e164, "inboundEnabled": True, "agentId": {"$exists": True}}
    )
    if not num or not num.get("agentId"):
        raise ValueError(f"inbound DID {did_e164} is not mapped to a live agent")
    agent = await db["agents"].find_one({"_id": num["agentId"], "orgId": num["orgId"]})
    if not agent:
        raise ValueError(f"agent for DID {did_e164} not found")
    if agent.get("status") != "live":
        raise ValueError(f"agent for DID {did_e164} is not live")

    org = await db["orgs"].find_one({"_id": agent["orgId"]}) or {}
    started_at = datetime.now(UTC)
    tier = str(agent.get("tier") or "pipeline")
    meta = {"did": did_e164, **(metadata or {})}
    call_doc = {
        "orgId": agent["orgId"],
        "agentId": agent["_id"],
        "direction": "inbound",
        "fromE164": caller_e164,
        "toE164": did_e164,
        "tier": tier,
        "startedAt": started_at,
        "outcome": "in_progress",
        "transcript": [],
        "cost": {"sttPaisa": 0, "llmPaisa": 0, "ttsPaisa": 0, "sipPaisa": 0, "totalPaisa": 0},
        "metadata": meta,
        "latency": {"callCreatedAt": started_at.isoformat()},
        "edgeUuid": edge_uuid,
        "createdAt": started_at,
        "updatedAt": started_at,
    }
    inserted = await db["calls"].insert_one(call_doc)
    call_doc_id = str(inserted.inserted_id)
    if settings.gemini_preconnect_enabled and tier == "gemini_live":
        await warm_sessions.begin_prepare(
            call_doc_id,
            agent_id=str(agent["_id"]),
            prompt="",
            metadata=meta,
            agent=agent,
        )
    await post_voice_event(
        {
            "type": "call.started",
            "callId": call_doc_id,
            "agentId": str(agent["_id"]),
            "orgId": str(agent["orgId"]),
            "edgeUuid": edge_uuid,
            "direction": "inbound",
            "fromE164": caller_e164,
            "toE164": did_e164,
            "tier": tier,
            "startedAt": started_at.isoformat(),
        }
    )
    return {
        "callId": call_doc_id,
        "agentId": str(agent["_id"]),
        "tier": tier,
        "disclosureUrl": str(org.get("btrcDisclosureAudioUrl") or ""),
        "recordMode": {
            "required": "prompt",
            "optional": "on",
            "disabled": "off",
        }.get(str(org.get("recordingConsent") or "optional"), "on"),
        "consentPromptUrl": str(org.get("btrcConsentPromptUrl") or ""),
    }


async def _find_call_by_id_or_uuid(call_or_uuid: str) -> dict[str, Any] | None:
    db = get_db()
    if ObjectId.is_valid(call_or_uuid):
        doc = await db["calls"].find_one({"_id": ObjectId(call_or_uuid)})
        if doc:
            return doc
    return await db["calls"].find_one({"edgeUuid": call_or_uuid})


async def control_call(
    call_or_uuid: str,
    *,
    action: str,
    supervisor_id: str,
    target_e164: str,
) -> dict[str, Any]:
    """Attach a supervisor phone leg to a live call.

    The dashboard stores the audit event; this function performs only the
    telephony action and returns the generated supervisor channel UUID.
    """
    if action not in {"listen", "barge"}:
        raise ValueError(f"unsupported supervisor action: {action}")
    doc = await _find_call_by_id_or_uuid(call_or_uuid)
    if not doc:
        raise ValueError(f"call {call_or_uuid} not found")
    edge_uuid = str(doc.get("edgeUuid") or "")
    if not edge_uuid:
        raise ValueError(f"call {call_or_uuid} has no edge UUID")

    supervisor_uuid = str(uuid_lib.uuid4())
    if settings.voice_fake_driver:
        log.info(
            "control.fake_driver",
            call_id=str(doc.get("_id") or call_or_uuid),
            uuid=edge_uuid,
            action=action,
            supervisor_id=supervisor_id,
            target=target_e164,
            supervisor_uuid=supervisor_uuid,
        )
        return {"ok": True, "action": action, "supervisorLegUuid": supervisor_uuid}

    org_id = str(doc["orgId"])
    agent_id = str(doc.get("agentId") or "")
    gateway, cli = await resolve_outbound_gateway(org_id, agent_id, None)
    reply = await telephony.get_edge().eavesdrop(
        telephony.SupervisorParams(
            gateway=gateway,
            target_e164=target_e164,
            from_e164=cli,
            source_uuid=edge_uuid,
            supervisor_uuid=supervisor_uuid,
            action=action,
        )
    )
    ok = not str(reply).startswith("-ERR")
    result: dict[str, Any] = {"ok": ok, "action": action, "supervisorLegUuid": supervisor_uuid}
    if not ok:
        result["error"] = str(reply)
    return result


async def hangup_call(call_or_uuid: str) -> bool:
    """Hang up by Mongo Call _id or by edge UUID."""
    db = get_db()
    edge_uuid = call_or_uuid
    if ObjectId.is_valid(call_or_uuid):
        doc = await db["calls"].find_one({"_id": ObjectId(call_or_uuid)})
        if doc:
            edge_uuid = doc.get("edgeUuid") or call_or_uuid
    if settings.voice_fake_driver:
        log.info("hangup.fake_driver", uuid=edge_uuid)
        return True
    await telephony.get_edge().hangup(edge_uuid)
    return True


async def transfer_call(call_or_uuid: str, target: str) -> bool:
    db = get_db()
    edge_uuid = call_or_uuid
    if ObjectId.is_valid(call_or_uuid):
        doc = await db["calls"].find_one({"_id": ObjectId(call_or_uuid)})
        if doc:
            edge_uuid = doc.get("edgeUuid") or call_or_uuid
    if settings.voice_fake_driver:
        log.info("transfer.fake_driver", uuid=edge_uuid, target=target)
        return True
    await telephony.get_edge().transfer(edge_uuid, target)
    return True


async def execute_ivr_action(call_or_uuid: str, action: str) -> bool:
    db = get_db()
    doc = None
    edge_uuid = call_or_uuid
    if ObjectId.is_valid(call_or_uuid):
        doc = await db["calls"].find_one({"_id": ObjectId(call_or_uuid)})
        if doc:
            edge_uuid = doc.get("edgeUuid") or call_or_uuid
    now = datetime.now(UTC)
    if doc:
        await db["calls"].update_one(
            {"_id": doc["_id"]},
            {"$push": {"ivrEvents": {"action": action, "at": now.isoformat()}}},
        )
    if settings.voice_fake_driver:
        log.info("ivr.fake_driver", uuid=edge_uuid, action=action)
        return True
    edge = telephony.get_edge()
    reply = "+OK"
    if action.startswith("transfer:"):
        reply = await edge.transfer(edge_uuid, action.split(":", 1)[1])
    elif action.startswith("prompt:"):
        reply = await edge.playback(edge_uuid, action.split(":", 1)[1])
    elif action == "hangup":
        reply = await edge.hangup(edge_uuid)
    else:
        return False
    return not str(reply).startswith("-ERR")
