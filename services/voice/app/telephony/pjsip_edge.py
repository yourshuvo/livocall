from __future__ import annotations

import asyncio
import importlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import structlog
from bson import ObjectId

from app.billing import compute_cost
from app.db import get_db
from app.persistence import finalize_call
from app.settings import settings
from app.telephony.edge import OriginateParams, SupervisorParams, TelephonyEdge
from app.telephony.media_bridge import PjsipMediaBridge
from app.web_client import post_voice_event

log = structlog.get_logger()


@dataclass
class PjsipCallContext:
    call_doc_id: str
    agent_id: str
    tier: str
    answered_at: datetime | None = None
    started_at: datetime | None = None


async def create_inbound_call_from_pjsip(
    *,
    did_e164: str,
    caller_e164: str,
    pjsip_uuid: str,
) -> dict[str, str]:
    from app import originator

    return await originator.create_inbound_call(
        did_e164=did_e164,
        caller_e164=caller_e164,
        fs_uuid=pjsip_uuid,
        metadata={"source": "pjsip-inbound"},
    )


async def handle_dtmf_for_call(call_doc_id: str, digit: str) -> None:
    from app import event_bridge

    db = get_db()
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
        await event_bridge._execute_dtmf_digit(doc, digit)


class PjsipEdge(TelephonyEdge):
    """Embedded PJSIP/pjsua2 call edge.

    This in-process edge replaces the FreeSWITCH control plane for SIP REGISTER,
    outbound calls, inbound calls, DTMF, call lifecycle, and media handoff to the
    existing LivoCall tier pipeline.
    """

    name = "pjsip"

    def __init__(
        self,
        *,
        sip_server: str | None = None,
        sip_port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        auth_username: str | None = None,
        realm: str | None = None,
        local_sip_port: int | None = None,
    ) -> None:
        self.sip_server = sip_server if sip_server is not None else settings.pjsip_sip_server
        self.sip_port = sip_port if sip_port is not None else settings.pjsip_sip_port
        self.username = username if username is not None else settings.pjsip_username
        self.password = password if password is not None else settings.pjsip_password
        self.auth_username = (
            auth_username if auth_username is not None else settings.pjsip_auth_username
        ) or self.username
        self.realm = realm if realm is not None else settings.pjsip_realm
        self.local_sip_port = (
            local_sip_port if local_sip_port is not None else settings.pjsip_local_sip_port
        )
        self._pj: Any | None = None
        self._endpoint: Any | None = None
        self._account: Any | None = None
        self._calls: dict[str, Any] = {}
        self._call_contexts: dict[str, PjsipCallContext] = {}
        self._media_bridges: dict[str, PjsipMediaBridge] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._started = False

    async def start(self) -> None:
        if self._started:
            return
        if not self.sip_server or not self.username or not self.password:
            raise RuntimeError(
                "PJSIP edge requires PJSIP_SIP_SERVER, PJSIP_USERNAME, and PJSIP_PASSWORD"
            )
        self._loop = asyncio.get_running_loop()
        self._pj = self._load_pjsua2()
        endpoint = self._pj.Endpoint()
        endpoint.libCreate()
        endpoint.libInit(self._pj.EpConfig())
        transport_cfg = self._pj.TransportConfig()
        transport_cfg.port = self.local_sip_port
        endpoint.transportCreate(self._pj.PJSIP_TRANSPORT_UDP, transport_cfg)
        endpoint.libStart()

        account_cfg = self._pj.AccountConfig()
        account_cfg.idUri = f"sip:{self.username}@{self.sip_server}"
        account_cfg.regConfig.registrarUri = f"sip:{self.sip_server}:{self.sip_port}"
        account_cfg.sipConfig.authCreds.append(
            self._pj.AuthCredInfo(
                "digest",
                self.realm,
                self.auth_username,
                0,
                self.password,
            )
        )
        account = self._make_account()
        account.create(account_cfg)
        self._endpoint = endpoint
        self._account = account
        self._started = True

    async def stop(self) -> None:
        for bridge in list(self._media_bridges.values()):
            await bridge.stop()
        self._media_bridges.clear()
        if self._endpoint is not None:
            self._endpoint.libDestroy()
        self._endpoint = None
        self._account = None
        self._calls.clear()
        self._call_contexts.clear()
        self._started = False

    async def originate(self, params: OriginateParams) -> str:
        await self.start()
        if self._pj is None or self._account is None:
            raise RuntimeError("PJSIP edge did not start")
        call = self._make_call(params.channel_uuid)
        self._calls[params.channel_uuid] = call
        self._call_contexts[params.channel_uuid] = PjsipCallContext(
            call_doc_id=params.call_doc_id,
            agent_id=params.agent_id,
            tier=params.tier,
            started_at=datetime.now(UTC),
        )
        call_params = self._pj.CallOpParam(True)
        destination = self._destination_uri(params.to_e164)
        call.makeCall(destination, call_params)
        return params.channel_uuid

    async def hangup(self, uuid: str, cause: str = "NORMAL_CLEARING") -> str:  # noqa: ARG002
        call = self._calls.get(uuid)
        if call is None:
            return "-ERR call not found"
        if self._pj is None:
            return "-ERR PJSIP edge not started"
        prm = self._pj.CallOpParam()
        call.hangup(prm)
        return "+OK"

    async def transfer(self, uuid: str, target: str) -> str:
        call = self._calls.get(uuid)
        if call is None:
            return "-ERR call not found"
        if self._pj is None:
            return "-ERR PJSIP edge not started"
        prm = self._pj.CallOpParam()
        call.xfer(self._destination_uri(target), prm)
        return "+OK"

    async def playback(self, uuid: str, url: str) -> str:
        # For PJSIP calls, TTS should normally flow through the media bridge.
        # File playback support can be added by decoding the URL/WAV into the
        # bridge outbound queue; fail clearly instead of silently doing nothing.
        return f"-ERR PJSIP file playback is not implemented for {url} on {uuid}"

    async def eavesdrop(self, params: SupervisorParams) -> str:  # noqa: ARG002
        return "-ERR PJSIP supervisor listen/barge is not implemented"

    def _make_account(self) -> Any:
        if self._pj is None:
            raise RuntimeError("PJSIP edge did not start")
        edge = self
        base = self._pj.Account

        class LivoCallAccount(base):  # type: ignore[misc, valid-type]
            def onIncomingCall(self, prm: Any) -> None:  # noqa: N802
                edge._run_coroutine(edge._handle_incoming_call(prm))

        return LivoCallAccount()

    def _make_call(self, uuid: str, call_id: int = -1) -> Any:
        if self._pj is None or self._account is None:
            raise RuntimeError("PJSIP edge did not start")
        edge = self
        base = self._pj.Call

        class LivoCallCall(base):  # type: ignore[misc, valid-type]
            def __init__(self) -> None:
                try:
                    super().__init__(edge._account, call_id)
                except TypeError:
                    super().__init__(edge._account)
                self._livocall_uuid = uuid

            def onCallState(self, prm: Any) -> None:  # noqa: N802, ARG002
                edge._run_coroutine(edge._handle_call_state(self))

            def onCallMediaState(self, prm: Any) -> None:  # noqa: N802, ARG002
                edge._run_coroutine(edge._handle_call_media_state(self))

            def onDtmfDigit(self, prm: Any) -> None:  # noqa: N802
                digit = str(getattr(prm, "digit", "") or getattr(prm, "dtmf", ""))
                edge._run_coroutine(edge._handle_dtmf_digit(self, digit))

            def onDtmfEvent(self, prm: Any) -> None:  # noqa: N802
                digit = str(getattr(prm, "digit", "") or getattr(prm, "dtmf", ""))
                edge._run_coroutine(edge._handle_dtmf_digit(self, digit))

        return LivoCallCall()

    async def _handle_incoming_call(self, prm: Any) -> None:
        if self._pj is None:
            return
        raw_call_id = int(getattr(prm, "callId", -1))
        uuid = f"pjsip-{raw_call_id}"
        call = self._make_call(uuid, raw_call_id)
        self._calls[uuid] = call
        info = call.getInfo()
        did_e164 = _normalize_phone(_sip_uri_user(str(getattr(info, "localUri", ""))))
        caller_e164 = _normalize_phone(_sip_uri_user(str(getattr(info, "remoteUri", ""))))
        answer_prm = self._pj.CallOpParam()
        try:
            inbound = await create_inbound_call_from_pjsip(
                did_e164=did_e164,
                caller_e164=caller_e164,
                pjsip_uuid=uuid,
            )
            self._call_contexts[uuid] = PjsipCallContext(
                call_doc_id=str(inbound.get("callId") or ""),
                agent_id=str(inbound.get("agentId") or ""),
                tier=str(inbound.get("tier") or "pipeline"),
                started_at=datetime.now(UTC),
            )
            answer_prm.statusCode = 200
            call.answer(answer_prm)
        except Exception as exc:  # noqa: BLE001
            log.warning("pjsip.inbound_rejected", error=str(exc), did=did_e164, caller=caller_e164)
            answer_prm.statusCode = 480
            call.answer(answer_prm)

    async def _handle_call_state(self, call: Any) -> None:
        uuid = str(getattr(call, "_livocall_uuid", ""))
        context = self._call_contexts.get(uuid)
        if not uuid or context is None or not ObjectId.is_valid(context.call_doc_id):
            return
        info = call.getInfo()
        state_text = str(getattr(info, "stateText", "") or "").upper()
        if "CONFIRMED" in state_text and context.answered_at is None:
            context.answered_at = datetime.now(UTC)
            await get_db()["calls"].update_one(
                {"_id": ObjectId(context.call_doc_id)},
                {"$set": {"answeredAt": context.answered_at, "updatedAt": context.answered_at}},
            )
        if "DISCONN" in state_text or "DISCONNECTED" in state_text:
            await self._complete_call(uuid, context, info)

    async def _handle_call_media_state(self, call: Any) -> None:
        uuid = str(getattr(call, "_livocall_uuid", ""))
        context = self._call_contexts.get(uuid)
        if not uuid or context is None or not context.call_doc_id or not context.agent_id:
            return
        if uuid in self._media_bridges or self._pj is None:
            return
        bridge = PjsipMediaBridge(self._pj, sample_rate=settings.sample_rate_in)
        self._media_bridges[uuid] = bridge
        bridge.start(
            call,
            call_id=context.call_doc_id,
            agent_id=context.agent_id,
            tier=context.tier,
        )

    async def _handle_dtmf_digit(self, call: Any, digit: str) -> None:
        if not digit:
            return
        uuid = str(getattr(call, "_livocall_uuid", ""))
        context = self._call_contexts.get(uuid)
        if context is None or not ObjectId.is_valid(context.call_doc_id):
            return
        await handle_dtmf_for_call(context.call_doc_id, digit)

    async def _complete_call(self, uuid: str, context: PjsipCallContext, info: Any) -> None:
        if not ObjectId.is_valid(context.call_doc_id):
            return
        db = get_db()
        doc = await db["calls"].find_one({"_id": ObjectId(context.call_doc_id)})
        if not doc:
            return
        duration_sec = _duration_seconds(info, context)
        cause = str(getattr(info, "lastReason", "") or getattr(info, "lastStatusCode", "") or "")
        outcome = _outcome_from_cause(cause or "NORMAL_CLEARING")
        cost = compute_cost(doc.get("tier", context.tier), duration_sec)
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
        await post_voice_event(
            {
                "type": "call.completed",
                "callId": context.call_doc_id,
                "endedAt": ended.isoformat(),
                "durationSec": duration_sec,
                "outcome": outcome,
                "cost": cost.to_dict(),
                "hangupCause": cause,
            }
        )
        asyncio.create_task(finalize_call(context.call_doc_id))
        bridge = self._media_bridges.pop(uuid, None)
        if bridge is not None:
            await bridge.stop()
        self._calls.pop(uuid, None)
        self._call_contexts.pop(uuid, None)

    def _destination_uri(self, target: str) -> str:
        if target.startswith("sip:"):
            return target
        return f"sip:{target}@{self.sip_server}:{self.sip_port}"

    def _run_coroutine(self, coro: Any) -> None:
        loop = self._loop
        if loop is not None and loop.is_running():
            loop.create_task(coro)
            return
        asyncio.create_task(coro)

    @staticmethod
    def _load_pjsua2() -> Any:
        try:
            module = importlib.import_module("pjsua2")
        except ImportError as exc:
            raise RuntimeError(
                "pjsua2 is not installed; install/build PJSIP Python bindings before TELEPHONY_EDGE=pjsip"
            ) from exc
        if module is None:
            raise RuntimeError(
                "pjsua2 is not installed; install/build PJSIP Python bindings before TELEPHONY_EDGE=pjsip"
            )
        return module


def _outcome_from_cause(cause: str) -> str:
    if cause in ("NORMAL_CLEARING", "NONE", "200", "OK"):
        return "completed"
    if cause in ("NO_ANSWER", "ALLOTTED_TIMEOUT", "408", "480", "487"):
        return "no_answer"
    if cause in ("USER_BUSY", "486"):
        return "busy"
    if cause in ("UNALLOCATED_NUMBER", "404"):
        return "failed"
    if "VOICEMAIL" in cause:
        return "voicemail"
    return "failed"


def _sip_uri_user(uri: str) -> str:
    match = re.search(r"sip:([^@;>]+)", uri)
    if match:
        return match.group(1)
    return uri


def _normalize_phone(value: str) -> str:
    raw = "".join(ch for ch in value.strip() if ch.isdigit() or ch == "+")
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if raw.startswith("+"):
        if digits.startswith("880"):
            return f"+{digits}"
        if digits.startswith("0"):
            return f"+880{digits[1:]}"
        return f"+{digits}"
    if digits.startswith("00880"):
        return f"+{digits[2:]}"
    if digits.startswith("00"):
        return f"+{digits[2:]}"
    if digits.startswith("880"):
        return f"+{digits}"
    if digits.startswith("0"):
        return f"+880{digits[1:]}"
    if len(digits) == 10 and digits[0] in {"1", "9"}:
        return f"+880{digits}"
    return f"+{digits}"


def _duration_seconds(info: Any, context: PjsipCallContext) -> int:
    total = getattr(info, "totalDuration", None)
    sec = getattr(total, "sec", None)
    if isinstance(sec, int):
        return max(0, sec)
    if context.answered_at is not None:
        return max(0, int((datetime.now(UTC) - context.answered_at).total_seconds()))
    if context.started_at is not None:
        return max(0, int((datetime.now(UTC) - context.started_at).total_seconds()))
    return 0
