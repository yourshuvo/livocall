from __future__ import annotations

import pytest

from app.freeswitch_controller import (
    FreeswitchController,
    parse_gateway_detail,
    parse_gateway_rows,
)

GATEWAY_ROWS = """
    Profile::Gateway-Name\t                        Data    \tState\tPing Time\tIB Calls(F/T)\tOB Calls(F/T)
=================================================================================================
external::ipt_09639148184\tsip:09639148184@103.15.140.151:5060\tREGED\t  0.00\t0/0\t2/3
=================================================================================================
1 gateway: Inbound(Failed/Total): 0/0,Outbound(Failed/Total):2/3
"""

GATEWAY_DETAIL = """
=================================================================================================
Name    \tipt_09639148184
Profile \texternal
Realm   \tsip.icctalk.com
Username\t09639148184
Password\tsecret
From    \t<sip:09639148184@103.15.140.151:5060>
Contact \t<sip:09639148184@163.227.239.163:5080;transport=udp;gw=ipt_09639148184>
State   \tREGED
Status  \tUP
=================================================================================================
"""


class FakeEslClient:
    def __init__(self, replies: dict[str, str]) -> None:
        self.replies = replies
        self.commands: list[str] = []
        self.connected = False
        self.closed = False

    async def connect(self) -> None:
        self.connected = True

    async def api(self, command: str) -> str:
        self.commands.append(command)
        return self.replies.get(command, "+OK")

    async def close(self) -> None:
        self.closed = True


def test_parse_gateway_rows_extracts_profile_name_state_and_call_counts() -> None:
    rows = parse_gateway_rows(GATEWAY_ROWS)

    assert rows == [
        {
            "profile": "external",
            "name": "ipt_09639148184",
            "data": "sip:09639148184@103.15.140.151:5060",
            "state": "REGED",
            "pingTime": 0.0,
            "inbound": {"failed": 0, "total": 0},
            "outbound": {"failed": 2, "total": 3},
        }
    ]


def test_parse_gateway_detail_redacts_password_but_keeps_registration_fields() -> None:
    detail = parse_gateway_detail(GATEWAY_DETAIL)

    assert detail["name"] == "ipt_09639148184"
    assert detail["profile"] == "external"
    assert detail["realm"] == "sip.icctalk.com"
    assert detail["username"] == "09639148184"
    assert detail["password"] == "[REDACTED]"
    assert detail["state"] == "REGED"
    assert detail["status"] == "UP"
    assert "163.227.239.163:5080" in detail["contact"]


@pytest.mark.asyncio
async def test_status_connects_to_esl_and_returns_gateway_summary() -> None:
    fake = FakeEslClient(
        {
            "sofia status gateway": GATEWAY_ROWS,
            "sofia status profile external": "Name\texternal\nURL\tsip:mod_sofia@163.227.239.163:5080\nREGISTRATIONS\t1\n",
        }
    )
    controller = FreeswitchController(client_factory=lambda: fake)  # type: ignore[arg-type]

    status = await controller.status()

    assert fake.connected is True
    assert fake.closed is True
    assert fake.commands == ["sofia status gateway", "sofia status profile external"]
    assert status["connected"] is True
    assert status["gateways"][0]["name"] == "ipt_09639148184"
    assert status["gateways"][0]["state"] == "REGED"
    assert status["profile"]["registrations"] == "1"


@pytest.mark.asyncio
async def test_resync_reloads_xml_acl_and_rescans_profile() -> None:
    fake = FakeEslClient({})
    controller = FreeswitchController(client_factory=lambda: fake)  # type: ignore[arg-type]

    result = await controller.resync(profile="external")

    assert result["ok"] is True
    assert fake.commands == [
        "reloadxml",
        "reloadacl",
        "sofia profile external rescan reloadxml",
        "sofia status gateway",
    ]


@pytest.mark.asyncio
async def test_gateway_action_rejects_unsafe_names_before_esl_call() -> None:
    fake = FakeEslClient({})
    controller = FreeswitchController(client_factory=lambda: fake)  # type: ignore[arg-type]

    with pytest.raises(ValueError, match="invalid gateway"):
        await controller.gateway_action("bad;shutdown", "register")

    assert fake.commands == []


@pytest.mark.asyncio
async def test_gateway_action_maps_register_unregister_and_killgw_commands() -> None:
    fake = FakeEslClient({"sofia status gateway ipt_09639148184": GATEWAY_DETAIL})
    controller = FreeswitchController(client_factory=lambda: fake)  # type: ignore[arg-type]

    result = await controller.gateway_action("ipt_09639148184", "register", profile="external")

    assert fake.commands == [
        "sofia profile external register ipt_09639148184",
        "sofia status gateway ipt_09639148184",
    ]
    assert result["ok"] is True
    assert result["gateway"]["state"] == "REGED"


class FakeController:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[str, ...], dict[str, str]]] = []

    async def status(self, profile: str = "external") -> dict[str, object]:
        self.calls.append(("status", (), {"profile": profile}))
        return {"connected": True, "profile": {"name": profile}, "gateways": []}

    async def resync(self, profile: str = "external") -> dict[str, object]:
        self.calls.append(("resync", (), {"profile": profile}))
        return {"ok": True, "profile": profile, "gateways": []}

    async def gateway_action(
        self,
        gateway: str,
        action: str,
        profile: str = "external",
    ) -> dict[str, object]:
        self.calls.append(("gateway_action", (gateway, action), {"profile": profile}))
        return {"ok": True, "profile": profile, "gateway": {"name": gateway, "state": "REGED"}}


def test_freeswitch_status_endpoint_uses_controller(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient

    from app import main

    fake = FakeController()
    monkeypatch.setattr(main.freeswitch_controller, "get_controller", lambda: fake)

    res = TestClient(main.app).get("/freeswitch/status?profile=external")

    assert res.status_code == 200
    assert res.json()["connected"] is True
    assert fake.calls == [("status", (), {"profile": "external"})]


def test_freeswitch_resync_endpoint_uses_controller(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient

    from app import main

    fake = FakeController()
    monkeypatch.setattr(main.freeswitch_controller, "get_controller", lambda: fake)

    res = TestClient(main.app).post("/freeswitch/resync", json={"profile": "external"})

    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert fake.calls == [("resync", (), {"profile": "external"})]


def test_freeswitch_gateway_action_endpoint_uses_controller(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from fastapi.testclient import TestClient

    from app import main

    fake = FakeController()
    monkeypatch.setattr(main.freeswitch_controller, "get_controller", lambda: fake)

    res = TestClient(main.app).post(
        "/freeswitch/gateways/ipt_09639148184/action",
        json={"action": "register", "profile": "external"},
    )

    assert res.status_code == 200
    assert res.json()["gateway"]["state"] == "REGED"
    assert fake.calls == [
        ("gateway_action", ("ipt_09639148184", "register"), {"profile": "external"})
    ]
