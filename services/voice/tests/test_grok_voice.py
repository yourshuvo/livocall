from __future__ import annotations

from app.agent_runtime import grok_language, grok_voice, grok_voice_model
from app.settings import settings
from app.tiers.grok_voice import _apply_tone, _connect_xai, _session_update


def test_grok_model_aliases_default_and_legacy() -> None:
    assert grok_voice_model({}) == "grok-voice-think-fast-1.0"
    assert grok_voice_model({"model": "grok-voice-fast"}) == "grok-voice-fast-1.0"


def test_grok_voice_aliases_dashboard_ids() -> None:
    assert grok_voice({"voice": {"voiceId": "xai:pooja"}}) == "pooja"
    assert grok_voice({"voice": {"voiceId": "custom-voice"}}) == "custom-voice"


def test_grok_language_maps_legacy_dashboard_codes() -> None:
    assert grok_language({"language": "bn-BD"}) == "bn"
    assert grok_language({"language": "bn-en-mixed"}) == "bn"
    assert grok_language({"language": "bn"}) == "bn"


def test_apply_tone_adds_voice_style_instruction() -> None:
    assert "Voice tone: warm" in _apply_tone("Be concise.", {"voice": {"style": "warm"}})


def test_session_update_uses_pcmu_for_low_latency_bridge() -> None:
    event = _session_update("Be concise.", "rohan", "bn", True)
    session = event["session"]
    assert event["type"] == "session.update"
    assert session["instructions"].startswith("Be concise.")
    assert "Language preference" in session["instructions"]
    assert session["voice"] == "rohan"
    assert session["turn_detection"]["type"] == "server_vad"
    assert session["audio"]["input"]["format"]["type"] == "audio/pcmu"
    assert session["audio"]["output"]["format"]["type"] == "audio/pcmu"


def test_session_update_uses_pcm16_rates_for_standard_bridge() -> None:
    event = _session_update("Be concise.", "rohan", "bn", False)
    session = event["session"]
    assert session["audio"]["input"]["format"] == {"type": "audio/pcm", "rate": 16000}
    assert session["audio"]["output"]["format"] == {"type": "audio/pcm", "rate": 16000}


def test_connect_xai_uses_model_query_and_auth_header(monkeypatch) -> None:
    seen: dict[str, object] = {}
    monkeypatch.setattr(settings, "xai_api_key", "test-key")

    class NewWebsockets:
        @staticmethod
        def connect(url: str, *, additional_headers: dict[str, str]) -> str:
            seen["url"] = url
            seen["headers"] = additional_headers
            return "connected"

    assert _connect_xai(NewWebsockets, "grok-voice-think-fast-1.0") == "connected"
    assert seen == {
        "url": "wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0",
        "headers": {"Authorization": "Bearer test-key"},
    }
