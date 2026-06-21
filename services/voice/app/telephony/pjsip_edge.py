from __future__ import annotations

import asyncio
import importlib
import re
import tempfile
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog
from bson import ObjectId

from app.billing import compute_cost
from app.campaign_attempts import update_campaign_attempt_for_call
from app.db import get_db
from app.persistence import finalize_call
from app.settings import settings
from app.sip_credentials import decrypt_sip_password
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
    disclosure_url: str = ""
    record_mode: str = "on"
    consent_prompt_url: str = ""
    account_key: str = ""


@dataclass
class PjsipAccountConfig:
    key: str
    sip_server: str
    sip_port: int
    username: str
    password: str = ""
    auth_username: str = ""
    realm: str = "*"
    sip_proxy: str = ""
    register: bool = True
    transport: str = "udp"
    codecs: str = ""
    inbound_enabled: bool = True
    outbound_enabled: bool = True

    @property
    def account_host(self) -> str:
        return self.sip_server

    @property
    def route_host(self) -> str:
        return self.sip_proxy or self.sip_server


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
        edge_uuid=pjsip_uuid,
        metadata={"source": "pjsip-inbound"},
    )


async def handle_dtmf_for_call(call_doc_id: str, digit: str) -> None:
    from app.originator import execute_ivr_action

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
            if action:
                await execute_ivr_action(str(doc["_id"]), action)
            return


class PjsipEdge(TelephonyEdge):
    """Embedded PJSIP/pjsua2 call edge.

    This in-process edge owns SIP REGISTER, outbound calls, inbound calls, DTMF,
    call lifecycle, and media handoff to the existing LivoCall tier pipeline.
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
        self._accounts: dict[str, Any] = {}
        self._account_configs: dict[str, PjsipAccountConfig] = {}
        self._calls: dict[str, Any] = {}
        self._call_contexts: dict[str, PjsipCallContext] = {}
        self._media_bridges: dict[str, PjsipMediaBridge] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._started = False

    async def start(self) -> None:
        if self._started:
            return
        self._loop = asyncio.get_running_loop()
        self._pj = self._load_pjsua2()
        endpoint = self._pj.Endpoint()
        endpoint.libCreate()
        ep_cfg = self._pj.EpConfig()
        self._configure_endpoint(ep_cfg)
        endpoint.libInit(ep_cfg)
        transport_cfg = self._pj.TransportConfig()
        transport_cfg.port = self.local_sip_port
        self._configure_transport(transport_cfg)
        endpoint.transportCreate(self._transport_type(settings.pjsip_transport), transport_cfg)
        endpoint.libStart()
        self._endpoint = endpoint
        self._started = True

        env_config = self._env_account_config()
        if env_config is not None:
            self._create_account(env_config)

        await self.reload_accounts(ignore_errors=env_config is not None)
        if not self._accounts:
            raise RuntimeError(
                "PJSIP edge requires env PJSIP_* credentials or active PhoneNumber SIP rows"
            )
        self._account = self._accounts.get(settings.pjsip_default_account_slug) or next(
            iter(self._accounts.values())
        )
        self._configure_codecs()

    async def stop(self) -> None:
        for bridge in list(self._media_bridges.values()):
            await bridge.stop()
        self._media_bridges.clear()
        for account in list(self._accounts.values()):
            with suppress(Exception):
                account.shutdown()
        if self._endpoint is not None:
            self._endpoint.libDestroy()
        self._endpoint = None
        self._account = None
        self._accounts.clear()
        self._account_configs.clear()
        self._calls.clear()
        self._call_contexts.clear()
        self._started = False

    async def originate(self, params: OriginateParams) -> str:
        await self.start()
        if self._pj is None or self._account is None:
            raise RuntimeError("PJSIP edge did not start")
        account_key = params.gateway or settings.pjsip_default_account_slug
        account_config = self._account_config_for_key(account_key)
        call = self._make_call(params.channel_uuid, account_key=account_config.key)
        self._calls[params.channel_uuid] = call
        self._call_contexts[params.channel_uuid] = PjsipCallContext(
            call_doc_id=params.call_doc_id,
            agent_id=params.agent_id,
            tier=params.tier,
            started_at=datetime.now(UTC),
            disclosure_url=params.disclosure_url,
            record_mode=params.record_mode,
            consent_prompt_url=params.consent_prompt_url,
            account_key=account_config.key,
        )
        call_params = self._pj.CallOpParam(True)
        destination = self._destination_uri(params.to_e164, account_config)
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
        context = self._call_contexts.get(uuid)
        config = self._account_config_for_key(context.account_key if context else "")
        call.xfer(self._destination_uri(target, config), prm)
        return "+OK"

    async def playback(self, uuid: str, url: str) -> str:
        bridge = self._media_bridges.get(uuid)
        if bridge is None or bridge.ws is None:
            return "-ERR call media bridge not ready"
        try:
            path = await _playback_url_to_path(url)
            queued = bridge.ws.queue_wav_file(path)
        except Exception as exc:  # noqa: BLE001
            return f"-ERR PJSIP playback failed: {exc}"
        return f"+OK queued {queued} bytes"

    async def eavesdrop(self, params: SupervisorParams) -> str:  # noqa: ARG002
        return "-ERR PJSIP supervisor listen/barge is not implemented"

    def _env_account_config(self) -> PjsipAccountConfig | None:
        if not self.sip_server or not self.username:
            return None
        return PjsipAccountConfig(
            key=settings.pjsip_default_account_slug or "sip_custom",
            sip_server=self.sip_server,
            sip_port=self.sip_port,
            username=self.username,
            password=self.password,
            auth_username=self.auth_username or self.username,
            realm=self.realm or "*",
            register=True,
            transport=settings.pjsip_transport,
            codecs=settings.pjsip_codecs,
        )

    def _account_config_from_number(self, doc: dict[str, Any]) -> PjsipAccountConfig | None:
        server = str(doc.get("sipServer") or "").strip()
        username = str(doc.get("sipUsername") or "").strip()
        if not server or not username:
            return None
        register = doc.get("sipRegister") is not False
        password = decrypt_sip_password(str(doc.get("sipPassword") or ""))
        if register and not password:
            log.warning(
                "pjsip.account_skipped_no_password",
                provider_slug=doc.get("providerSlug"),
                e164=doc.get("e164"),
            )
            return None
        return PjsipAccountConfig(
            key=_safe_account_key(
                str(doc.get("providerSlug") or doc.get("e164") or doc.get("_id"))
            ),
            sip_server=server,
            sip_port=int(doc.get("sipPort") or 5060),
            sip_proxy=str(doc.get("sipProxy") or "").strip(),
            username=username,
            password=password,
            auth_username=str(doc.get("sipAuthUsername") or username),
            realm=str(doc.get("sipRealm") or server),
            register=register,
            transport=str(doc.get("sipTransport") or settings.pjsip_transport or "udp"),
            codecs=str(doc.get("sipCodecs") or settings.pjsip_codecs),
            inbound_enabled=doc.get("inboundEnabled") is not False,
            outbound_enabled=doc.get("outboundEnabled") is not False,
        )

    def _create_account(self, config: PjsipAccountConfig) -> None:
        if self._pj is None:
            raise RuntimeError("PJSIP edge did not start")
        account_cfg = self._pj.AccountConfig()
        account_cfg.idUri = f"sip:{config.username}@{config.account_host}"
        registrar = f"sip:{config.route_host}:{config.sip_port}"
        account_cfg.regConfig.registrarUri = registrar if config.register else ""
        with suppress(Exception):
            account_cfg.regConfig.registerOnAdd = bool(config.register)
        with suppress(Exception):
            account_cfg.sipConfig.proxies.append(
                f"sip:{config.route_host}:{config.sip_port};transport={config.transport.lower()}"
            )
        if config.password:
            account_cfg.sipConfig.authCreds.append(
                self._pj.AuthCredInfo(
                    "digest",
                    config.realm or "*",
                    config.auth_username or config.username,
                    0,
                    config.password,
                )
            )
        account = self._make_account(config.key)
        account.create(account_cfg)
        self._accounts[config.key] = account
        self._account_configs[config.key] = config
        log.info(
            "pjsip.account_created",
            key=config.key,
            server=config.sip_server,
            proxy=config.sip_proxy,
            register=config.register,
        )

    def _account_config_for_key(self, key: str) -> PjsipAccountConfig:
        if key and key in self._account_configs:
            return self._account_configs[key]
        default_key = settings.pjsip_default_account_slug or "sip_custom"
        if default_key in self._account_configs:
            return self._account_configs[default_key]
        if self._account_configs:
            return next(iter(self._account_configs.values()))
        env_config = self._env_account_config()
        if env_config is not None:
            return env_config
        raise RuntimeError("PJSIP edge has no SIP account configured")

    def _configure_endpoint(self, ep_cfg: Any) -> None:
        med = getattr(ep_cfg, "medConfig", None)
        if med is None:
            return
        for attr, value in (
            ("clockRate", settings.sample_rate_in),
            ("sndClockRate", settings.sample_rate_in),
            ("channelCount", 1),
            ("audioFramePtime", settings.pjsip_frame_ms),
            ("port", settings.pjsip_rtp_port_start),
            ("portRange", settings.pjsip_rtp_port_range),
            ("port_range", settings.pjsip_rtp_port_range),
        ):
            with suppress(Exception):
                setattr(med, attr, value)

    def _configure_transport(self, transport_cfg: Any) -> None:
        for attr, value in (
            ("publicAddress", settings.pjsip_public_address),
            ("boundAddress", settings.pjsip_bound_address),
        ):
            if value:
                with suppress(Exception):
                    setattr(transport_cfg, attr, value)

    def _transport_type(self, transport: str) -> Any:
        if self._pj is None:
            raise RuntimeError("PJSIP edge did not start")
        selected = transport.strip().lower()
        if selected == "tcp":
            return getattr(self._pj, "PJSIP_TRANSPORT_TCP", self._pj.PJSIP_TRANSPORT_UDP)
        if selected == "tls":
            return getattr(self._pj, "PJSIP_TRANSPORT_TLS", self._pj.PJSIP_TRANSPORT_UDP)
        return self._pj.PJSIP_TRANSPORT_UDP

    def _configure_codecs(self) -> None:
        if self._endpoint is None:
            return
        wanted = _codec_names(
            ",".join(
                [settings.pjsip_codecs]
                + [cfg.codecs for cfg in self._account_configs.values() if cfg.codecs]
            )
        )
        if not wanted:
            return
        with suppress(Exception):
            codecs = list(self._endpoint.codecEnum2())
            codec_ids = [str(getattr(c, "codecId", getattr(c, "id", ""))) for c in codecs]
            for codec_id in codec_ids:
                if codec_id:
                    self._endpoint.codecSetPriority(codec_id, 0)
            priority = 255
            for name in wanted:
                for codec_id in codec_ids:
                    if _codec_matches(codec_id, name):
                        self._endpoint.codecSetPriority(codec_id, priority)
                priority = max(1, priority - 8)

    async def reload_accounts(self, *, ignore_errors: bool = False) -> dict[str, object]:
        if self._pj is None or self._endpoint is None:
            await self.start()
            return {"ok": True, "accounts": sorted(self._accounts)}
        if not settings.pjsip_load_accounts_from_db:
            return {"ok": True, "accounts": sorted(self._accounts), "db": "disabled"}
        loaded = 0
        skipped = 0
        seen_keys: set[str] = set()
        env_config = self._env_account_config()
        env_key = env_config.key if env_config is not None else ""
        try:
            db = get_db()
            cursor = db["phonenumbers"].find(
                {
                    "status": "active",
                    "sipServer": {"$exists": True, "$ne": ""},
                    "sipUsername": {"$exists": True, "$ne": ""},
                }
            )
            async for doc in cursor:
                config = self._account_config_from_number(doc)
                if config is None:
                    skipped += 1
                    continue
                seen_keys.add(config.key)
                if config.key in self._accounts:
                    if self._account_configs.get(config.key) != config:
                        old = self._accounts.pop(config.key, None)
                        with suppress(Exception):
                            old.shutdown()
                        self._account_configs.pop(config.key, None)
                        self._create_account(config)
                    else:
                        self._account_configs[config.key] = config
                    loaded += 1
                    continue
                self._create_account(config)
                loaded += 1
            for key in list(self._accounts):
                if key == env_key or key in seen_keys:
                    continue
                old = self._accounts.pop(key, None)
                with suppress(Exception):
                    old.shutdown()
                self._account_configs.pop(key, None)
        except Exception as exc:  # noqa: BLE001
            if not ignore_errors:
                raise
            log.warning("pjsip.reload_accounts_failed", error=str(exc))
        default_key = settings.pjsip_default_account_slug or "sip_custom"
        self._account = self._accounts.get(default_key) or next(iter(self._accounts.values()), None)
        return {
            "ok": True,
            "accounts": sorted(self._accounts),
            "loaded": loaded,
            "skipped": skipped,
        }

    def _make_account(self, account_key: str) -> Any:
        if self._pj is None:
            raise RuntimeError("PJSIP edge did not start")
        edge = self
        base = self._pj.Account

        class LivoCallAccount(base):  # type: ignore[misc, valid-type]
            def __init__(self) -> None:
                with suppress(TypeError):
                    super().__init__()
                self._livocall_account_key = account_key

            def onIncomingCall(self, prm: Any) -> None:  # noqa: N802
                edge._run_coroutine(edge._handle_incoming_call(prm, account_key))

        return LivoCallAccount()

    def _make_call(self, uuid: str, account_key: str = "", call_id: int = -1) -> Any:
        account = self._accounts.get(account_key) or self._account
        if self._pj is None or account is None:
            raise RuntimeError("PJSIP edge did not start")
        edge = self
        base = self._pj.Call

        class LivoCallCall(base):  # type: ignore[misc, valid-type]
            def __init__(self) -> None:
                try:
                    super().__init__(account, call_id)
                except TypeError:
                    super().__init__(account)
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

    async def _handle_incoming_call(self, prm: Any, account_key: str) -> None:
        if self._pj is None:
            return
        raw_call_id = int(getattr(prm, "callId", -1))
        uuid = f"pjsip-{raw_call_id}"
        call = self._make_call(uuid, account_key=account_key, call_id=raw_call_id)
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
                disclosure_url=str(inbound.get("disclosureUrl") or ""),
                record_mode=str(inbound.get("recordMode") or "on"),
                consent_prompt_url=str(inbound.get("consentPromptUrl") or ""),
                account_key=account_key,
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
            record_audio=context.record_mode != "off",
        )
        prompt_url = (
            context.consent_prompt_url
            if context.record_mode == "prompt"
            else context.disclosure_url
        )
        if prompt_url:
            await self.playback(uuid, prompt_url)

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
        await update_campaign_attempt_for_call(doc, outcome, ended)
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

    def _destination_uri(self, target: str, config: PjsipAccountConfig | None = None) -> str:
        if target.startswith("sip:"):
            return target
        cfg = config or self._account_config_for_key("")
        return f"sip:{target}@{cfg.route_host}:{cfg.sip_port}"

    def _run_coroutine(self, coro: Any) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            with suppress(Exception):
                coro.close()
            return

        def _schedule() -> None:
            task = loop.create_task(coro)
            task.add_done_callback(self._log_task_exception)

        with suppress(RuntimeError):
            loop.call_soon_threadsafe(_schedule)

    @staticmethod
    def _log_task_exception(task: asyncio.Task[Any]) -> None:
        with suppress(asyncio.CancelledError):
            exc = task.exception()
            if exc is not None:
                log.exception("pjsip.callback_task_error", error=str(exc))

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


async def _playback_url_to_path(url: str) -> Path:
    parsed = urlparse(url)
    if parsed.scheme == "file":
        return Path(parsed.path)
    if parsed.scheme in {"http", "https"}:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url)
            res.raise_for_status()
        with tempfile.NamedTemporaryFile(
            prefix="livocall-pjsip-playback-", suffix=".wav", delete=False
        ) as tmp:
            tmp.write(res.content)
            return Path(tmp.name)
    if parsed.scheme:
        raise ValueError(f"unsupported playback URL scheme: {parsed.scheme}")
    return Path(url)


def _safe_account_key(value: str) -> str:
    key = re.sub(r"[^A-Za-z0-9_-]+", "_", value.strip()).strip("_")[:80]
    return key or settings.pjsip_default_account_slug or "sip_custom"


def _codec_names(raw: str) -> list[str]:
    names: list[str] = []
    for part in raw.replace(";", ",").split(","):
        token = part.strip()
        if not token:
            continue
        token = re.sub(r"@\d+(ms|i)\b", "", token, flags=re.IGNORECASE)
        token = token.replace("/1", "")
        upper = token.upper()
        if upper in {"PCMU", "ULAW", "G711U", "G.711U"}:
            upper = "PCMU/8000"
        elif upper in {"PCMA", "ALAW", "G711A", "G.711A"}:
            upper = "PCMA/8000"
        elif "/" not in upper and upper in {"G722", "G729"}:
            upper = f"{upper}/8000"
        if upper not in names:
            names.append(upper)
    return names


def _codec_matches(codec_id: str, wanted: str) -> bool:
    left = codec_id.upper()
    right = wanted.upper()
    return left == right or left.startswith(f"{right}/") or right.startswith(f"{left}/")


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
    connected = getattr(info, "connectDuration", None)
    connected_sec = getattr(connected, "sec", None)
    if isinstance(connected_sec, int):
        return max(0, connected_sec)
    if context.answered_at is not None:
        return max(0, int((datetime.now(UTC) - context.answered_at).total_seconds()))
    total = getattr(info, "totalDuration", None)
    total_sec = getattr(total, "sec", None)
    if isinstance(total_sec, int):
        return max(0, total_sec)
    if context.started_at is not None:
        return max(0, int((datetime.now(UTC) - context.started_at).total_seconds()))
    return 0
