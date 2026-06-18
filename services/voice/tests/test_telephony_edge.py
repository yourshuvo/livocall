from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest


def test_telephony_edge_factory_defaults_to_freeswitch(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import telephony

    monkeypatch.setattr(telephony.settings, "telephony_edge", "freeswitch", raising=False)

    edge = telephony.get_edge(reset=True)

    assert edge.name == "freeswitch"


def test_telephony_edge_factory_selects_pjsip(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import telephony

    monkeypatch.setattr(telephony.settings, "telephony_edge", "pjsip", raising=False)

    edge = telephony.get_edge(reset=True)

    assert edge.name == "pjsip"


@pytest.mark.asyncio
async def test_pjsip_edge_fails_clearly_when_pjsua2_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.telephony.pjsip_edge import PjsipEdge

    monkeypatch.setitem(sys.modules, "pjsua2", None)
    edge = PjsipEdge(
        sip_server="103.15.140.151",
        username="09639148184",
        password="secret",
    )

    with pytest.raises(RuntimeError, match="pjsua2 is not installed"):
        await edge.start()


@pytest.mark.asyncio
async def test_pjsip_edge_registers_configured_account_with_fake_pjsua2(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.telephony.pjsip_edge import PjsipEdge

    calls: list[tuple[str, object]] = []

    class FakeEndpoint:
        def libCreate(self) -> None:  # noqa: N802
            calls.append(("libCreate", None))

        def libInit(self, cfg: object) -> None:  # noqa: N802
            calls.append(("libInit", cfg))

        def transportCreate(self, transport_type: object, cfg: object) -> None:  # noqa: N802
            calls.append(("transportCreate", (transport_type, cfg.port)))

        def libStart(self) -> None:  # noqa: N802
            calls.append(("libStart", None))

        def libDestroy(self) -> None:  # noqa: N802
            calls.append(("libDestroy", None))

    class FakeAccount:
        def create(self, cfg: object) -> None:
            calls.append(("accountCreate", cfg))

    class FakeEpConfig:
        pass

    class FakeTransportConfig:
        def __init__(self) -> None:
            self.port = 0

    class FakeAccountConfig:
        def __init__(self) -> None:
            self.idUri = ""
            self.regConfig = SimpleNamespace(registrarUri="")
            self.sipConfig = SimpleNamespace(authCreds=[])

    class FakeAuthCredInfo:
        def __init__(self, scheme: str, realm: str, username: str, data_type: int, password: str) -> None:
            self.scheme = scheme
            self.realm = realm
            self.username = username
            self.data_type = data_type
            self.password = password

    fake_pjsua2 = SimpleNamespace(
        Endpoint=FakeEndpoint,
        Account=FakeAccount,
        EpConfig=FakeEpConfig,
        TransportConfig=FakeTransportConfig,
        AccountConfig=FakeAccountConfig,
        AuthCredInfo=FakeAuthCredInfo,
        PJSIP_TRANSPORT_UDP="udp",
    )
    monkeypatch.setitem(sys.modules, "pjsua2", fake_pjsua2)
    edge = PjsipEdge(
        sip_server="103.15.140.151",
        sip_port=5060,
        username="09639148184",
        password="secret",
        auth_username="09639148184",
        realm="*",
        local_sip_port=5070,
    )

    await edge.start()
    await edge.stop()

    account_cfg = next(value for name, value in calls if name == "accountCreate")
    assert account_cfg.idUri == "sip:09639148184@103.15.140.151"
    assert account_cfg.regConfig.registrarUri == "sip:103.15.140.151:5060"
    assert account_cfg.sipConfig.authCreds[0].username == "09639148184"
    assert account_cfg.sipConfig.authCreds[0].password == "secret"
    assert ("transportCreate", ("udp", 5070)) in calls
    assert calls[-1] == ("libDestroy", None)


@pytest.mark.asyncio
async def test_originator_hangup_uses_selected_telephony_edge(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import originator

    calls: list[tuple[str, str]] = []

    class FakeEdge:
        async def hangup(self, uuid: str, cause: str = "NORMAL_CLEARING") -> str:
            calls.append((uuid, cause))
            return "+OK"

    monkeypatch.setattr(originator.settings, "voice_fake_driver", False)
    monkeypatch.setattr(originator.telephony, "get_edge", lambda: FakeEdge())

    assert await originator.hangup_call("11111111-2222-3333-4444-555555555555") is True
    assert calls == [("11111111-2222-3333-4444-555555555555", "NORMAL_CLEARING")]


def test_lifespan_starts_pjsip_edge_without_freeswitch_consumer(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient

    from app import main

    events: list[str] = []

    class FakePjsipEdge:
        async def start(self) -> None:
            events.append("edge.start")

        async def stop(self) -> None:
            events.append("edge.stop")

    def fail_consumer() -> object:
        raise AssertionError("FreeSWITCH consumer should not start for TELEPHONY_EDGE=pjsip")

    monkeypatch.setattr(main.settings, "voice_fake_driver", False)
    monkeypatch.setattr(main.settings, "telephony_edge", "pjsip", raising=False)
    monkeypatch.setattr(main.event_bridge, "get_consumer", fail_consumer)
    monkeypatch.setattr(main.telephony, "get_edge", lambda: FakePjsipEdge())

    with TestClient(main.app) as client:
        res = client.get("/health")

    assert res.status_code == 200
    assert res.json()["telephony_edge"] == "pjsip"
    assert events == ["edge.start", "edge.stop"]
