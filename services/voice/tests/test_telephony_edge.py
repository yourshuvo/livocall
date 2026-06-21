from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


def test_telephony_edge_factory_defaults_to_pjsip(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import telephony

    monkeypatch.setattr(telephony.settings, "telephony_edge", "pjsip", raising=False)

    edge = telephony.get_edge(reset=True)

    assert edge.name == "pjsip"


def test_telephony_edge_factory_rejects_unsupported_edge(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import telephony

    monkeypatch.setattr(telephony.settings, "telephony_edge", "legacy", raising=False)

    with pytest.raises(ValueError, match="TELEPHONY_EDGE=pjsip"):
        telephony.get_edge(reset=True)


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
    assert hasattr(edge._account, "onIncomingCall")
    await edge.stop()

    account_cfg = next(value for name, value in calls if name == "accountCreate")
    assert account_cfg.idUri == "sip:09639148184@103.15.140.151"
    assert account_cfg.regConfig.registrarUri == "sip:103.15.140.151:5060"
    assert account_cfg.sipConfig.authCreds[0].username == "09639148184"
    assert account_cfg.sipConfig.authCreds[0].password == "secret"
    assert ("transportCreate", ("udp", 5070)) in calls
    assert calls[-1] == ("libDestroy", None)


@pytest.mark.asyncio
async def test_pjsip_incoming_call_creates_livocall_call_and_answers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.telephony import pjsip_edge
    from app.telephony.pjsip_edge import PjsipEdge

    answered: list[int] = []
    created: list[dict[str, str]] = []

    class FakeEndpoint:
        def libCreate(self) -> None:  # noqa: N802
            return None

        def libInit(self, cfg: object) -> None:  # noqa: N802, ARG002
            return None

        def transportCreate(self, transport_type: object, cfg: object) -> None:  # noqa: N802, ARG002
            return None

        def libStart(self) -> None:  # noqa: N802
            return None

    class FakeAccount:
        def create(self, cfg: object) -> None:  # noqa: ARG002
            return None

    class FakeCall:
        def __init__(self, account: object, call_id: int = -1) -> None:  # noqa: ARG002
            self.call_id = call_id

        def getInfo(self) -> object:  # noqa: N802
            return SimpleNamespace(
                localUri="sip:09639148184@103.15.140.151",
                remoteUri="sip:01780614365@103.15.140.151",
            )

        def answer(self, prm: object) -> None:
            answered.append(prm.statusCode)

    class FakeCallOpParam:
        def __init__(self, _use_default: bool = False) -> None:
            self.statusCode = 0

    fake_pjsua2 = SimpleNamespace(
        Endpoint=FakeEndpoint,
        Account=FakeAccount,
        Call=FakeCall,
        CallOpParam=FakeCallOpParam,
        EpConfig=lambda: object(),
        TransportConfig=lambda: SimpleNamespace(port=0),
        AccountConfig=lambda: SimpleNamespace(
            idUri="",
            regConfig=SimpleNamespace(registrarUri=""),
            sipConfig=SimpleNamespace(authCreds=[]),
        ),
        AuthCredInfo=lambda *args: object(),
        PJSIP_TRANSPORT_UDP="udp",
    )
    monkeypatch.setitem(sys.modules, "pjsua2", fake_pjsua2)

    async def fake_create_inbound_call_from_pjsip(**kwargs: str) -> dict[str, str]:
        created.append(kwargs)
        return {"callId": "507f1f77bcf86cd799439011", "agentId": "agent-1", "tier": "pipeline"}

    monkeypatch.setattr(
        pjsip_edge,
        "create_inbound_call_from_pjsip",
        fake_create_inbound_call_from_pjsip,
        raising=False,
    )

    edge = PjsipEdge(sip_server="103.15.140.151", username="09639148184", password="secret")
    await edge.start()
    edge._account.onIncomingCall(SimpleNamespace(callId=23))
    await asyncio.sleep(0)

    assert created == [
        {
            "did_e164": "+8809639148184",
            "caller_e164": "+8801780614365",
            "pjsip_uuid": "pjsip-23",
        }
    ]
    assert answered == [200]
    assert "pjsip-23" in edge._calls


@pytest.mark.asyncio
async def test_pjsip_dtmf_is_routed_to_existing_ivr_logic(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.telephony import pjsip_edge
    from app.telephony.pjsip_edge import PjsipCallContext, PjsipEdge

    executed: list[tuple[str, str]] = []

    async def fake_handle_dtmf_for_call(call_doc_id: str, digit: str) -> None:
        executed.append((call_doc_id, digit))

    monkeypatch.setattr(pjsip_edge, "handle_dtmf_for_call", fake_handle_dtmf_for_call, raising=False)
    edge = PjsipEdge(sip_server="103.15.140.151", username="09639148184", password="secret")
    call = SimpleNamespace(_livocall_uuid="pjsip-abc")
    edge._call_contexts["pjsip-abc"] = PjsipCallContext(
        call_doc_id="507f1f77bcf86cd799439011",
        agent_id="agent-1",
        tier="pipeline",
    )

    await edge._handle_dtmf_digit(call, "5")

    assert executed == [("507f1f77bcf86cd799439011", "5")]


def test_pjsip_raw_pcm_websocket_adapts_audio_queues() -> None:
    from app.telephony.media_bridge import PjsipPcmWebSocket

    ws = PjsipPcmWebSocket(call_id="call-1")
    ws.push_inbound_pcm(b"caller")

    received = asyncio.run(ws.receive())
    asyncio.run(ws.send_bytes(b"bot"))

    assert received == {"type": "websocket.receive", "bytes": b"caller"}
    assert ws.pop_outbound_pcm_nowait() == b"bot"


def test_pjsip_raw_pcm_websocket_records_bidirectional_audio(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import wave

    from app.telephony import media_bridge
    from app.telephony.media_bridge import PjsipPcmWebSocket

    monkeypatch.setattr(media_bridge.settings, "recordings_local_dir", str(tmp_path))
    ws = PjsipPcmWebSocket(call_id="507f1f77bcf86cd799439011", record_audio=True)

    ws.push_inbound_pcm(b"\x01\x00" * 160)
    asyncio.run(ws.send_bytes(b"\x02\x00" * 160))
    asyncio.run(ws.close())

    path = tmp_path / "507f1f77bcf86cd799439011.wav"
    assert path.exists()
    with wave.open(str(path), "rb") as wav:
        assert wav.getnchannels() == 1
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == 16000
        assert wav.getnframes() == 320


def test_pjsip_media_bridge_queues_wav_file_playback(tmp_path: Path) -> None:
    import wave

    from app.telephony.media_bridge import PjsipPcmWebSocket

    wav_path = tmp_path / "prompt.wav"
    with wave.open(str(wav_path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\x03\x00" * 160)

    ws = PjsipPcmWebSocket(call_id="call-1")
    queued = ws.queue_wav_file(wav_path)

    assert queued == 320
    assert ws.pop_outbound_pcm_nowait() == b"\x03\x00" * 160


def test_voice_dockerfile_builds_pjsua2_from_pjproject_source() -> None:
    dockerfile = (Path(__file__).resolve().parents[1] / "Dockerfile").read_text()

    assert "PJSIP_VERSION" in dockerfile
    assert "github.com/pjsip/pjproject" in dockerfile
    assert "swig" in dockerfile
    assert "pjsip-apps/src/swig/python" in dockerfile
    assert "python -c \"import pjsua2" in dockerfile


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


def test_lifespan_starts_pjsip_edge(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient

    from app import main

    events: list[str] = []

    class FakePjsipEdge:
        async def start(self) -> None:
            events.append("edge.start")

        async def stop(self) -> None:
            events.append("edge.stop")

    monkeypatch.setattr(main.settings, "voice_fake_driver", False)
    monkeypatch.setattr(main.settings, "telephony_edge", "pjsip", raising=False)
    monkeypatch.setattr(main.telephony, "get_edge", lambda: FakePjsipEdge())

    with TestClient(main.app) as client:
        res = client.get("/health")

    assert res.status_code == 200
    assert res.json()["telephony_edge"] == "pjsip"
    assert events == ["edge.start", "edge.stop"]


def test_prod_compose_defaults_to_pjsip_and_does_not_deploy_legacy_edge() -> None:
    from pathlib import Path

    compose_path = Path(__file__).resolve().parents[3] / "infra" / "docker-compose.prod.yml"
    compose = compose_path.read_text()

    assert "TELEPHONY_EDGE: ${TELEPHONY_EDGE:-pjsip}" in compose
    assert "PJSIP_LOCAL_SIP_PORT" in compose
    assert "5070:5070/udp" in compose

    prod_env = (compose_path.parent / ".env.prod.example").read_text()
    assert "TELEPHONY_EDGE=pjsip" in prod_env
    assert "PJSIP_LOCAL_SIP_PORT=5070" in prod_env
