from __future__ import annotations

import importlib
from typing import Any

from app.settings import settings
from app.telephony.edge import OriginateParams, SupervisorParams, TelephonyEdge


class PjsipEdge(TelephonyEdge):
    """Embedded PJSIP/pjsua2 call edge.

    This is the in-process replacement path for FreeSWITCH. It owns a single SIP
    account configured from env and exposes the same backend control surface as
    the FreeSWITCH edge. Media bridging is intentionally implemented in this
    module rather than by deploying a PBX sidecar.
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
        self._started = False

    async def start(self) -> None:
        if self._started:
            return
        if not self.sip_server or not self.username or not self.password:
            raise RuntimeError(
                "PJSIP edge requires PJSIP_SIP_SERVER, PJSIP_USERNAME, and PJSIP_PASSWORD"
            )
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
        account = self._pj.Account()
        account.create(account_cfg)
        self._endpoint = endpoint
        self._account = account
        self._started = True

    async def stop(self) -> None:
        if self._endpoint is not None:
            self._endpoint.libDestroy()
        self._endpoint = None
        self._account = None
        self._calls.clear()
        self._started = False

    async def originate(self, params: OriginateParams) -> str:
        await self.start()
        if self._pj is None or self._account is None:
            raise RuntimeError("PJSIP edge did not start")
        call = self._pj.Call(self._account)
        call_params = self._pj.CallOpParam(True)
        destination = self._destination_uri(params.to_e164)
        call.makeCall(destination, call_params)
        self._calls[params.channel_uuid] = call
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

    async def playback(self, uuid: str, url: str) -> str:  # noqa: ARG002
        raise NotImplementedError(
            "PJSIP playback/media injection is not wired yet; use the Gemini/Grok media bridge task"
        )

    async def eavesdrop(self, params: SupervisorParams) -> str:  # noqa: ARG002
        raise NotImplementedError("PJSIP supervisor listen/barge is not wired yet")

    def _destination_uri(self, target: str) -> str:
        if target.startswith("sip:"):
            return target
        return f"sip:{target}@{self.sip_server}:{self.sip_port}"

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
