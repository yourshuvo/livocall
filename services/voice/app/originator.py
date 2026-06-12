"""Outbound call originator.

Wraps :class:`EslClient` with all the dashboard-side concerns: looking up the
agent + the right SIP gateway from PhoneNumber, persisting the Call doc, and
notifying the web app.
"""

from __future__ import annotations

import ipaddress
import socket
import uuid as uuid_lib
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import structlog
from bson import ObjectId

from app.db import get_db
from app.esl import EslClient, EslConfig
from app.runtime_overrides import runtime_overrides
from app.settings import settings
from app.warm_sessions import warm_sessions
from app.web_client import post_voice_event
from app.ws_auth import sign as ws_sign

log = structlog.get_logger()


def _esl_config() -> EslConfig:
    return EslConfig(
        host=settings.fs_host, port=settings.fs_esl_port, password=settings.fs_esl_password
    )


def _container_bridge_ipv4() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("1.1.1.1", 80))
            ip = sock.getsockname()[0]
        if ipaddress.ip_address(ip).is_private:
            return ip
    except OSError:
        return ""
    except ValueError:
        return ""
    return ""


def _audio_fork_base_url() -> str:
    base = settings.voice_ws_public_url.rstrip("/")
    if not settings.voice_ws_bridge_autodetect_enabled:
        return base
    parsed = urlsplit(base)
    if parsed.scheme not in {"ws", "wss"} or not parsed.hostname:
        return base
    # The BDIX deployment runs FreeSWITCH on the same VPS as this Docker bridge.
    # Using the public Coolify/TLS route for audio_fork can add ~5s before the
    # AI transport even sees the call. For the known public host, hand FS the
    # private bridge IP instead; auth query signing still applies below.
    if parsed.hostname != "voice.livocall.com":
        return base
    ip = _container_bridge_ipv4()
    if not ip:
        return base
    netloc = f"{ip}:{settings.voice_ws_internal_port}"
    return urlunsplit(("ws", netloc, parsed.path, "", "")).rstrip("/")


def _build_ws_url(
    *,
    call_doc_id: str,
    agent_id: str,
    tier: str,
    metadata: dict[str, str] | None,
) -> str:
    from urllib.parse import urlencode

    base = _audio_fork_base_url()
    if settings.low_latency_pcmu_bridge_enabled and tier in {"gemini_live", "grok_voice"}:
        base = base.removesuffix("/ws/audio") + "/ws/audio-pcmu"
    qs: list[tuple[str, str]] = [
        ("call_id", call_doc_id),
        ("agent_id", agent_id),
        ("tier", tier),
    ]
    for k, v in (metadata or {}).items():
        qs.append(("meta", f"{k}:{v}"))
    auth = ws_sign(call_doc_id)
    if auth:
        qs.append(("auth", auth))
    return f"{base}?{urlencode(qs)}"


def build_ws_url(
    *,
    call_doc_id: str,
    agent_id: str,
    tier: str,
    metadata: dict[str, str] | None = None,
) -> str:
    return _build_ws_url(
        call_doc_id=call_doc_id,
        agent_id=agent_id,
        tier=tier,
        metadata=metadata,
    )


def audio_fork_args(ws_url: str) -> str:
    sample_rate = (
        8000 if ws_url.split("?", 1)[0].endswith("/ws/audio-pcmu") else settings.sample_rate_in
    )
    # drachtio mod_audio_fork's optional args are positional:
    # [bugname] [metadata] [bidirectionalAudio_enabled]
    # [bidirectionalAudio_stream_enabled] [bidirectionalAudio_stream_samplerate].
    # This module build rejects binary WS frames, so enable bidirectional
    # playback but leave stream mode off; outbound audio is sent as JSON
    # playAudio {audioContentType: raw, sampleRate, audioContent} messages.
    # Do not append "buffer/jitterbuffer" here; those are not supported options
    # for this module and would occupy the bidirectional flags.
    return " ".join(
        [ws_url, "mono", str(sample_rate), "livocall", "null", "true", "false", str(sample_rate)]
    )


async def resolve_outbound_gateway(
    org_id: str,
    agent_id: str,
    from_e164: str | None,
    *,
    prefer_default_gateway: bool = False,
) -> tuple[str, str]:
    """Pick a sofia gateway slug + the from_e164 to use.

    Strategy:
    1. If from_e164 is provided and that PhoneNumber is outbound-enabled,
       use its providerSlug.
    2. Else pick any outboundEnabled PhoneNumber in the org, preserving the
       requested caller ID when it belongs to the org.
    3. Else fall back to settings.fs_default_gateway and the requested org
       caller ID or settings.default_outbound_caller_id.
    """
    db = get_db()
    org_oid = ObjectId(org_id)
    requested_cli = ""
    if from_e164:
        num = await db["phonenumbers"].find_one({"orgId": org_oid, "e164": from_e164})
        if num:
            requested_cli = str(num.get("e164") or from_e164)
        if prefer_default_gateway:
            preferred_gateway = settings.fs_dashboard_test_gateway or settings.fs_default_gateway
            if preferred_gateway:
                return preferred_gateway, requested_cli or from_e164
        if num and num.get("outboundEnabled") is True and str(num.get("providerSlug") or ""):
            return num["providerSlug"], num["e164"]
    fallback = await db["phonenumbers"].find_one(
        {"orgId": org_oid, "outboundEnabled": True, "providerSlug": {"$exists": True, "$ne": ""}}
    )
    if fallback:
        return fallback["providerSlug"], requested_cli or fallback["e164"]
    return settings.fs_default_gateway, requested_cli or settings.default_outbound_caller_id


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
        prefer_default_gateway=(metadata or {}).get("source") == "dashboard-test",
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
    # Pre-generate the channel UUID so we can hangup/transfer immediately
    # without waiting for CHANNEL_CREATE to land. We pass it to FreeSWITCH as
    # ``origination_uuid`` so the channel is created with this exact UUID.
    fs_uuid = str(uuid_lib.uuid4())
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
        "fsUuid": fs_uuid,
        "createdAt": started_at,
        "updatedAt": started_at,
    }
    inserted = await db["calls"].insert_one(call_doc)
    call_doc_id = str(inserted.inserted_id)
    if tools:
        await runtime_overrides.set(call_doc_id, {"tools": tools})

    if settings.voice_fake_driver:
        fs_uuid = f"fake-{call_doc_id}"
        await db["calls"].update_one(
            {"_id": inserted.inserted_id}, {"$set": {"fsUuid": fs_uuid}}
        )
        log.info("originate.fake_driver", call_doc_id=call_doc_id, to=to_e164)
    else:
        ws_url = _build_ws_url(call_doc_id=call_doc_id, agent_id=agent_id, tier=tier, metadata=metadata)
        if settings.gemini_preconnect_enabled and tier == "gemini_live":
            await warm_sessions.begin_prepare(
                call_doc_id,
                agent_id=agent_id,
                prompt="",
                metadata=metadata,
                agent=agent,
            )
        client = EslClient(_esl_config())
        try:
            await client.connect()
            await client.originate(
                gateway=gateway,
                to_e164=to_e164,
                agent_id=agent_id,
                tier=tier,
                from_e164=cli,
                ws_url=audio_fork_args(ws_url),
                call_doc_id=call_doc_id,
                channel_uuid=fs_uuid,
                disclosure_url=disclosure_url,
                record_mode=record_mode,
                consent_prompt_url=consent_prompt_url,
            )
        except Exception:
            await warm_sessions.cleanup(call_doc_id)
            raise
        finally:
            await client.close()

    # Notify web (best-effort) so the dashboard can subscribe to call.started.
    await post_voice_event(
        {
            "type": "call.started",
            "callId": call_doc_id,
            "agentId": agent_id,
            "orgId": org_id,
            "fsUuid": fs_uuid,
            "direction": "outbound",
            "fromE164": cli,
            "toE164": to_e164,
            "tier": tier,
            "startedAt": started_at.isoformat(),
        }
    )

    return {"callId": call_doc_id, "fsUuid": fs_uuid, "queued": True}


async def create_inbound_call(
    *,
    did_e164: str,
    caller_e164: str,
    fs_uuid: str,
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
        "fsUuid": fs_uuid,
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
            "fsUuid": fs_uuid,
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
        "wsUrl": audio_fork_args(build_ws_url(call_doc_id=call_doc_id, agent_id=str(agent["_id"]), tier=tier, metadata=meta)),
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
    return await db["calls"].find_one({"fsUuid": call_or_uuid})


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
    fs_uuid = str(doc.get("fsUuid") or "")
    if not fs_uuid:
        raise ValueError(f"call {call_or_uuid} has no FreeSWITCH UUID")

    supervisor_uuid = str(uuid_lib.uuid4())
    if settings.voice_fake_driver:
        log.info(
            "control.fake_driver",
            call_id=str(doc.get("_id") or call_or_uuid),
            uuid=fs_uuid,
            action=action,
            supervisor_id=supervisor_id,
            target=target_e164,
            supervisor_uuid=supervisor_uuid,
        )
        return {"ok": True, "action": action, "supervisorLegUuid": supervisor_uuid}

    org_id = str(doc["orgId"])
    agent_id = str(doc.get("agentId") or "")
    gateway, cli = await resolve_outbound_gateway(org_id, agent_id, None)
    client = EslClient(_esl_config())
    try:
        await client.connect()
        await client.eavesdrop(
            gateway=gateway,
            target_e164=target_e164,
            from_e164=cli,
            source_uuid=fs_uuid,
            supervisor_uuid=supervisor_uuid,
            action=action,
        )
        return {"ok": True, "action": action, "supervisorLegUuid": supervisor_uuid}
    finally:
        await client.close()


async def hangup_call(call_or_uuid: str) -> bool:
    """Hangup by Mongo Call _id or by FS UUID."""
    db = get_db()
    fs_uuid = call_or_uuid
    if ObjectId.is_valid(call_or_uuid):
        doc = await db["calls"].find_one({"_id": ObjectId(call_or_uuid)})
        if doc:
            fs_uuid = doc.get("fsUuid") or call_or_uuid
    if settings.voice_fake_driver:
        log.info("hangup.fake_driver", uuid=fs_uuid)
        return True
    client = EslClient(_esl_config())
    try:
        await client.connect()
        await client.hangup(fs_uuid)
        return True
    finally:
        await client.close()


async def transfer_call(call_or_uuid: str, target: str) -> bool:
    db = get_db()
    fs_uuid = call_or_uuid
    if ObjectId.is_valid(call_or_uuid):
        doc = await db["calls"].find_one({"_id": ObjectId(call_or_uuid)})
        if doc:
            fs_uuid = doc.get("fsUuid") or call_or_uuid
    if settings.voice_fake_driver:
        log.info("transfer.fake_driver", uuid=fs_uuid, target=target)
        return True
    client = EslClient(_esl_config())
    try:
        await client.connect()
        await client.transfer(fs_uuid, target)
        return True
    finally:
        await client.close()


async def execute_ivr_action(call_or_uuid: str, action: str) -> bool:
    db = get_db()
    doc = None
    fs_uuid = call_or_uuid
    if ObjectId.is_valid(call_or_uuid):
        doc = await db["calls"].find_one({"_id": ObjectId(call_or_uuid)})
        if doc:
            fs_uuid = doc.get("fsUuid") or call_or_uuid
    now = datetime.now(UTC)
    if doc:
        await db["calls"].update_one(
            {"_id": doc["_id"]},
            {"$push": {"ivrEvents": {"action": action, "at": now.isoformat()}}},
        )
    if settings.voice_fake_driver:
        log.info("ivr.fake_driver", uuid=fs_uuid, action=action)
        return True
    client = EslClient(_esl_config())
    try:
        await client.connect()
        if action.startswith("transfer:"):
            await client.transfer(fs_uuid, action.split(":", 1)[1])
        elif action.startswith("prompt:"):
            await client.playback(fs_uuid, action.split(":", 1)[1])
        elif action == "hangup":
            await client.hangup(fs_uuid)
        else:
            return False
        return True
    finally:
        await client.close()
