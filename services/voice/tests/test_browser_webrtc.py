from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app import browser_webrtc, ws_auth
from app.browser_webrtc import PipecatWebRTCImports, _gemini_live_tools, _register_live_tool_handler
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


class FakeIceCandidate:
    def __init__(self, **kwargs: Any) -> None:
        self.candidate = kwargs["candidate"]
        self.sdp_mid = kwargs["sdp_mid"]
        self.sdp_mline_index = kwargs["sdp_mline_index"]


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


class FakeLLM:
    def __init__(self) -> None:
        self.registrations: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    def register_function(self, *args: Any, **kwargs: Any) -> None:
        self.registrations.append((args, kwargs))


def _fake_imports() -> PipecatWebRTCImports:
    return PipecatWebRTCImports(
        SmallWebRTCRequest=FakeOffer,
        SmallWebRTCPatchRequest=FakePatch,
        SmallWebRTCRequestHandler=FakeHandler,
        IceCandidate=FakeIceCandidate,
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


def test_browser_webrtc_patch_normalizes_ice_candidate_dicts(monkeypatch) -> None:
    _enable_browser_webrtc(monkeypatch)
    token = ws_auth.sign("call-1")

    with TestClient(app) as client:
        offer_res = client.post(
            f"/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live&auth={token}",
            json={"sdp": "offer-sdp", "type": "offer"},
        )
        patch_res = client.patch(
            f"/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live&auth={token}",
            json={
                "pc_id": "pc-test",
                "candidates": [
                    {
                        "candidate": "candidate:1 1 udp 2130706431 192.0.2.1 54400 typ host",
                        "sdp_mid": "0",
                        "sdp_mline_index": 0,
                    }
                ],
            },
        )
        assert offer_res.status_code == 200
        assert patch_res.status_code == 200
        handler = browser_webrtc._small_webrtc_handler
        assert isinstance(handler, FakeHandler)
        patch = handler.patches[-1]
        assert patch.kwargs["pc_id"] == "pc-test"
        candidate = patch.kwargs["candidates"][0]
        assert isinstance(candidate, FakeIceCandidate)
        assert candidate.candidate.startswith("candidate:1 ")
        assert candidate.sdp_mid == "0"
        assert candidate.sdp_mline_index == 0


def test_browser_webrtc_patch_accepts_null_mline_index_with_numeric_mid(monkeypatch) -> None:
    _enable_browser_webrtc(monkeypatch)
    token = ws_auth.sign("call-1")

    with TestClient(app) as client:
        offer_res = client.post(
            f"/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live&auth={token}",
            json={"sdp": "offer-sdp", "type": "offer"},
        )
        patch_res = client.patch(
            f"/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live&auth={token}",
            json={
                "pc_id": "pc-test",
                "candidates": [
                    {
                        "candidate": "candidate:2 1 udp 1694498815 203.0.113.1 50000 typ relay",
                        "sdp_mid": "2",
                        "sdp_mline_index": None,
                    }
                ],
            },
        )

        assert offer_res.status_code == 200
        assert patch_res.status_code == 200
        handler = browser_webrtc._small_webrtc_handler
        assert isinstance(handler, FakeHandler)
        candidate = handler.patches[-1].kwargs["candidates"][0]
        assert isinstance(candidate, FakeIceCandidate)
        assert candidate.sdp_mid == "2"
        assert candidate.sdp_mline_index == 2


def test_browser_webrtc_patch_ignores_empty_ice_candidate_markers(monkeypatch) -> None:
    _enable_browser_webrtc(monkeypatch)
    token = ws_auth.sign("call-1")

    with TestClient(app) as client:
        offer_res = client.post(
            f"/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live&auth={token}",
            json={"sdp": "offer-sdp", "type": "offer"},
        )
        patch_res = client.patch(
            f"/webrtc/browser-offer?call_id=call-1&agent_id=agent-1&tier=gemini_live&auth={token}",
            json={
                "pc_id": "pc-test",
                "candidates": [
                    {"candidate": "", "sdp_mid": "0", "sdp_mline_index": 0},
                    {"candidate": None, "sdp_mid": "1", "sdp_mline_index": 1},
                ],
            },
        )

        assert offer_res.status_code == 200
        assert patch_res.status_code == 200
        handler = browser_webrtc._small_webrtc_handler
        assert isinstance(handler, FakeHandler)
        assert handler.patches[-1].kwargs["candidates"] == []


def test_gemini_live_tools_wrap_function_declarations() -> None:
    declaration = {
        "name": "search_knowledge_base",
        "description": "Search the knowledge base.",
        "parameters": {"type": "OBJECT", "properties": {"query": {"type": "STRING"}}},
    }

    assert _gemini_live_tools([]) is None
    assert _gemini_live_tools([declaration]) == [{"function_declarations": [declaration]}]


async def _fake_tool_handler(params: Any) -> None:
    return None


def test_live_tool_handler_survives_interruption() -> None:
    llm = FakeLLM()
    _register_live_tool_handler(
        llm,
        _fake_tool_handler,
        [{"name": "search_knowledge_base"}],
    )

    assert len(llm.registrations) == 1
    args, kwargs = llm.registrations[0]
    assert args == (None, _fake_tool_handler)
    assert kwargs == {"cancel_on_interruption": False}


def test_live_tool_handler_skips_registration_without_tools() -> None:
    llm = FakeLLM()
    _register_live_tool_handler(llm, _fake_tool_handler, [])

    assert llm.registrations == []
