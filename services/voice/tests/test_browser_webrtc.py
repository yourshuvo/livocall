from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app import browser_webrtc, ws_auth
from app.browser_webrtc import PipecatWebRTCImports
from app.main import app


class FakeIceServer:
    def __init__(self, **kwargs: Any) -> None:
        self.kwargs = kwargs


class FakeOffer:
    def __init__(self, **kwargs: Any) -> None:
        self.kwargs = kwargs

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FakeOffer:
        return cls(**data)


class FakePatch(FakeOffer):
    pass


class FakeHandler:
    def __init__(self, ice_servers: list[Any] | None = None) -> None:
        self.ice_servers = ice_servers or []
        self.patches: list[Any] = []

    async def handle_web_request(self, request: Any, webrtc_connection_callback: Any) -> dict[str, str]:
        assert request.kwargs["type"] == "offer"
        await webrtc_connection_callback("fake-connection")
        return {"sdp": "answer-sdp", "type": "answer", "pc_id": "pc-test"}

    async def handle_patch_request(self, request: Any) -> None:
        self.patches.append(request)

    async def close(self) -> None:
        return None


def _fake_imports() -> PipecatWebRTCImports:
    return PipecatWebRTCImports(
        SmallWebRTCRequest=FakeOffer,
        SmallWebRTCPatchRequest=FakePatch,
        SmallWebRTCRequestHandler=FakeHandler,
        IceServer=FakeIceServer,
    )


def _enable_browser_webrtc(monkeypatch) -> None:
    monkeypatch.setattr(browser_webrtc.settings, "browser_webrtc_enabled", True)
    monkeypatch.setattr(browser_webrtc.settings, "voice_ws_shared_secret", "secretkey")
    monkeypatch.setattr(browser_webrtc.settings, "webrtc_ice_servers", "stun:one,stun:two")
    monkeypatch.setattr(browser_webrtc.settings, "webrtc_turn_url", "turn:turn.example.com:3478")
    monkeypatch.setattr(browser_webrtc.settings, "webrtc_turn_username", "turn-user")
    monkeypatch.setattr(browser_webrtc.settings, "webrtc_turn_credential", "turn-pass")
    monkeypatch.setattr(browser_webrtc, "_small_webrtc_handler", None)
    monkeypatch.setattr(browser_webrtc, "_load_webrtc_imports", _fake_imports)


def test_browser_webrtc_config_exposes_public_ice_servers(monkeypatch) -> None:
    _enable_browser_webrtc(monkeypatch)

    with TestClient(app) as client:
        res = client.get("/webrtc/browser-config")

    assert res.status_code == 200
    body = res.json()
    assert body["enabled"] is True
    assert body["iceServers"] == [
        {"urls": "stun:one"},
        {"urls": "stun:two"},
        {
            "urls": "turn:turn.example.com:3478",
            "username": "turn-user",
            "credential": "turn-pass",
        },
    ]


def test_browser_webrtc_offer_rejects_bad_auth(monkeypatch) -> None:
    _enable_browser_webrtc(monkeypatch)

    with TestClient(app) as client:
        res = client.post(
            "/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live",
            json={"sdp": "offer-sdp", "type": "offer"},
        )

    assert res.status_code == 403


def test_browser_webrtc_offer_allows_cors_preflight(monkeypatch) -> None:
    _enable_browser_webrtc(monkeypatch)

    with TestClient(app) as client:
        res = client.options(
            "/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live",
            headers={
                "origin": "http://localhost:3000",
                "access-control-request-method": "POST",
                "access-control-request-headers": "content-type",
            },
        )

    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "POST" in res.headers["access-control-allow-methods"]


def test_browser_webrtc_offer_starts_background_bot(monkeypatch) -> None:
    _enable_browser_webrtc(monkeypatch)
    started: list[dict[str, Any]] = []

    async def fake_run_bot(connection: Any, **kwargs: Any) -> None:
        started.append({"connection": connection, **kwargs})

    monkeypatch.setattr(browser_webrtc, "run_browser_gemini_bot", fake_run_bot)
    token = ws_auth.sign("call-1")

    with TestClient(app) as client:
        res = client.post(
            f"/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live&auth={token}",
            json={"sdp": "offer-sdp", "type": "offer"},
        )

    assert res.status_code == 200
    assert res.json() == {"sdp": "answer-sdp", "type": "answer", "pc_id": "pc-test"}
    assert started == [
        {
            "connection": "fake-connection",
            "call_id": "call-1",
            "agent_id": "agent-1",
            "prompt": "",
            "metadata": {"source": "browser-webrtc"},
        }
    ]
