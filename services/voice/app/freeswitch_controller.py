"""FreeSWITCH control-plane helpers for the voice service.

This module keeps FreeSWITCH operations behind a small, validated API instead
of scattering raw ESL commands through route handlers. It intentionally exposes
only safe operational actions: status reads, XML/ACL/profile resync, and gateway
register/unregister/killgw.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from app.esl import EslClient, EslConfig
from app.settings import settings

_SAFE_TOKEN = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
_GATEWAY_ACTIONS = {
    "register": "register",
    "unregister": "unregister",
    "killgw": "killgw",
}


def _esl_config() -> EslConfig:
    return EslConfig(
        host=settings.fs_host,
        port=settings.fs_esl_port,
        password=settings.fs_esl_password,
    )


def _client_factory() -> EslClient:
    return EslClient(_esl_config())


def _calls(value: str) -> dict[str, int]:
    failed, _, total = value.strip().partition("/")
    return {"failed": int(failed or 0), "total": int(total or 0)}


def _key(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "")


def parse_gateway_rows(raw: str) -> list[dict[str, Any]]:
    """Parse ``sofia status gateway`` tabular output into JSON-safe rows."""
    gateways: list[dict[str, Any]] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("=") or stripped.startswith("Profile::"):
            continue
        if " gateway:" in stripped or " gateways:" in stripped:
            continue
        parts = [part.strip() for part in re.split(r"\t+| {2,}", stripped) if part.strip()]
        if len(parts) < 6 or "::" not in parts[0]:
            continue
        profile, name = parts[0].split("::", 1)
        try:
            ping_time = float(parts[3])
        except ValueError:
            ping_time = None
        gateways.append(
            {
                "profile": profile,
                "name": name,
                "data": parts[1],
                "state": parts[2],
                "pingTime": ping_time,
                "inbound": _calls(parts[4]),
                "outbound": _calls(parts[5]),
            }
        )
    return gateways


def parse_gateway_detail(raw: str) -> dict[str, str]:
    """Parse ``sofia status gateway <name>`` and redact secret fields."""
    detail: dict[str, str] = {}
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("="):
            continue
        if "\t" not in stripped:
            continue
        key, value = stripped.split("\t", 1)
        normalized = _key(key)
        if normalized in {"password", "authpassword"}:
            value = "[REDACTED]"
        detail[normalized] = value.strip()
    return detail


def parse_profile_status(raw: str) -> dict[str, str]:
    """Parse common ``sofia status profile`` key/value lines."""
    detail: dict[str, str] = {}
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("="):
            continue
        if "\t" in stripped:
            key, value = stripped.split("\t", 1)
        elif "  " in stripped:
            key, value = re.split(r" {2,}", stripped, maxsplit=1)
        else:
            continue
        detail[_key(key)] = value.strip()
    return detail


def _safe_token(value: str, label: str) -> str:
    if not _SAFE_TOKEN.fullmatch(value):
        raise ValueError(f"invalid {label}")
    return value


class FreeswitchController:
    def __init__(self, client_factory: Callable[[], EslClient] = _client_factory) -> None:
        self.client_factory = client_factory

    async def _with_client(self) -> EslClient:
        client = self.client_factory()
        await client.connect()
        return client

    async def status(self, profile: str = "external") -> dict[str, Any]:
        profile = _safe_token(profile, "profile")
        client = await self._with_client()
        try:
            gateway_raw = await client.api("sofia status gateway")
            profile_raw = await client.api(f"sofia status profile {profile}")
            return {
                "connected": True,
                "profile": parse_profile_status(profile_raw),
                "gateways": parse_gateway_rows(gateway_raw),
                "raw": {
                    "gateway": gateway_raw,
                    "profile": profile_raw,
                },
            }
        finally:
            await client.close()

    async def resync(self, profile: str = "external") -> dict[str, Any]:
        profile = _safe_token(profile, "profile")
        client = await self._with_client()
        try:
            results = {
                "reloadxml": await client.api("reloadxml"),
                "reloadacl": await client.api("reloadacl"),
                "rescan": await client.api(f"sofia profile {profile} rescan reloadxml"),
            }
            gateway_raw = await client.api("sofia status gateway")
            return {
                "ok": True,
                "profile": profile,
                "results": results,
                "gateways": parse_gateway_rows(gateway_raw),
            }
        finally:
            await client.close()

    async def gateway_action(
        self,
        gateway: str,
        action: str,
        profile: str = "external",
    ) -> dict[str, Any]:
        profile = _safe_token(profile, "profile")
        gateway = _safe_token(gateway, "gateway")
        command_action = _GATEWAY_ACTIONS.get(action)
        if command_action is None:
            raise ValueError("unsupported gateway action")
        client = await self._with_client()
        try:
            result = await client.api(f"sofia profile {profile} {command_action} {gateway}")
            detail_raw = await client.api(f"sofia status gateway {gateway}")
            return {
                "ok": True,
                "profile": profile,
                "gateway": parse_gateway_detail(detail_raw),
                "result": result,
            }
        finally:
            await client.close()


def get_controller() -> FreeswitchController:
    return FreeswitchController()
