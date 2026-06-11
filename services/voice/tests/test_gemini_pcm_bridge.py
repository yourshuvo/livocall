from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app import gemini_pcm_bridge as bridge


class FakeTypes:
    ThinkingConfig = object


class FakeSession:
    def __init__(self, responses: list[Any]) -> None:
        self._responses = responses

    async def receive(self):
        for response in self._responses:
            yield response


class FakeTranscript:
    def __init__(self) -> None:
        self.added: list[tuple[str, str]] = []
        self.flushes = 0

    async def add(self, role: str, text: str) -> None:
        self.added.append((role, text))

    async def flush(self) -> None:
        self.flushes += 1


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[bytes] = []

    async def send_bytes(self, data: bytes) -> None:
        self.sent.append(data)


def _transcription(text: str) -> SimpleNamespace:
    return SimpleNamespace(text=text)


def _response(
    content: Any = None,
    tool_call: Any = None,
    session_resumption_update: Any = None,
    go_away: Any = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        server_content=content,
        tool_call=tool_call,
        session_resumption_update=session_resumption_update,
        go_away=go_away,
    )


def test_live_config_enables_audio_transcription(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bridge.settings, "gemini_live_context_compression_enabled", True)
    config = bridge._live_config(
        FakeTypes,
        "Answer fast.",
        "Puck",
        {"runtimeSettings": {"geminiLiveVadSilenceMs": 600}},
    )

    assert config["response_modalities"] == ["AUDIO"]
    assert config["input_audio_transcription"] == {}
    assert config["output_audio_transcription"] == {}
    assert config["realtime_input_config"]["automatic_activity_detection"] == {
        "disabled": False,
        "prefix_padding_ms": 100,
        "silence_duration_ms": 600,
    }
    assert config["context_window_compression"] == {"sliding_window": {}}
    assert config["session_resumption"] == {"handle": None}
    assert config["thinking_config"] == {"thinking_level": "minimal"}


def test_live_config_enforces_safe_gemini_vad_floor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bridge.settings, "gemini_live_vad_silence_ms", 250)
    monkeypatch.setattr(bridge.settings, "gemini_live_vad_prefix_padding_ms", 25)

    config = bridge._live_config(FakeTypes, "Answer fast.", "Puck", {})

    assert config["realtime_input_config"]["automatic_activity_detection"] == {
        "disabled": False,
        "prefix_padding_ms": 100,
        "silence_duration_ms": 250,
    }


def test_bridge_removes_local_pcm_vad() -> None:
    assert not hasattr(bridge, "_pcm16_has_speech")


def test_bridge_modes_keep_phone_and_browser_separate() -> None:
    phone = bridge.GeminiPcmBridge.for_phone_call()
    browser = bridge.GeminiPcmBridge.for_browser_test()

    assert phone.wire_format == "pcmu"
    assert phone.input_queue_frames >= 100
    assert not hasattr(phone, "barge_in_enabled")
    assert browser.wire_format == "pcm16"
    assert browser.input_queue_frames < phone.input_queue_frames
    assert not hasattr(browser, "barge_in_enabled")


@pytest.mark.asyncio
async def test_iter_model_output_yields_transcripts_and_audio() -> None:
    content_1 = SimpleNamespace(
        input_transcription=_transcription("hello"),
        output_transcription=_transcription("Hi "),
        turn_complete=False,
        generation_complete=False,
        interrupted=False,
        model_turn=None,
    )
    content_2 = SimpleNamespace(
        input_transcription=None,
        output_transcription=_transcription("there"),
        turn_complete=True,
        generation_complete=False,
        interrupted=False,
        model_turn=SimpleNamespace(
            parts=[SimpleNamespace(inline_data=SimpleNamespace(data=b"pcm24"))]
        ),
    )

    items = [
        item
        async for item in bridge._iter_model_output(
            FakeSession([_response(content_1), _response(content_2)]),
            {},
            "64b64b64b64b64b64b64b64b",
        )
    ]

    assert items[0] == bridge.TranscriptUpdate("user", "hello")
    assert items[1] == bridge.TranscriptUpdate("agent", "Hi there")
    assert items[2] == b"pcm24"


@pytest.mark.asyncio
async def test_iter_model_output_clears_interrupted_agent_transcript() -> None:
    interrupted = SimpleNamespace(
        input_transcription=None,
        output_transcription=_transcription("discard me"),
        turn_complete=True,
        generation_complete=False,
        interrupted=True,
        model_turn=SimpleNamespace(
            parts=[SimpleNamespace(inline_data=SimpleNamespace(data=b"stale audio"))]
        ),
    )
    completed = SimpleNamespace(
        input_transcription=None,
        output_transcription=_transcription("keep me"),
        turn_complete=True,
        generation_complete=False,
        interrupted=False,
        model_turn=None,
    )

    items = [
        item
        async for item in bridge._iter_model_output(
            FakeSession([_response(interrupted), _response(completed)]),
            {},
            "64b64b64b64b64b64b64b64b",
        )
    ]

    assert items == [bridge.TranscriptUpdate("agent", "keep me")]


@pytest.mark.asyncio
async def test_iter_model_output_wraps_tool_response(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_execute_agent_tool(agent: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        assert agent == {}
        assert kwargs["name"] == "lookup_order"
        assert kwargs["arguments"] == {"query": "A1"}
        return {"ok": True}

    monkeypatch.setattr(bridge, "execute_agent_tool", fake_execute_agent_tool)
    call = SimpleNamespace(id="tool-1", name="lookup_order", args={"query": "A1"})
    tool_call = SimpleNamespace(function_calls=[call])

    items = [
        item
        async for item in bridge._iter_model_output(
            FakeSession([_response(tool_call=tool_call)]),
            {},
            "64b64b64b64b64b64b64b64b",
        )
    ]

    assert items == [
        bridge.ToolResponse(
            {"id": "tool-1", "name": "lookup_order", "response": {"ok": True}}
        )
    ]


@pytest.mark.asyncio
async def test_iter_model_output_captures_session_resumption_handle() -> None:
    state: dict[str, str] = {}
    update = SimpleNamespace(resumable=True, new_handle="resume-1")

    items = [
        item
        async for item in bridge._iter_model_output(
            FakeSession([_response(session_resumption_update=update)]),
            {},
            "64b64b64b64b64b64b64b64b",
            session_state=state,
        )
    ]

    assert items == []
    assert state == {"handle": "resume-1"}


@pytest.mark.asyncio
async def test_receive_model_audio_sends_pcm16_for_browser_wire_format() -> None:
    content = SimpleNamespace(
        input_transcription=None,
        output_transcription=None,
        turn_complete=True,
        generation_complete=False,
        interrupted=False,
        model_turn=SimpleNamespace(
            parts=[SimpleNamespace(inline_data=SimpleNamespace(data=b"\x01\x02" * 480))]
        ),
    )
    ws = FakeWebSocket()

    await bridge._receive_model_audio(
        FakeSession([_response(content)]),
        ws,  # type: ignore[arg-type]
        "64b64b64b64b64b64b64b64b",
        {},
        bridge.PcmuLatency("64b64b64b64b64b64b64b64b"),
        FakeTranscript(),  # type: ignore[arg-type]
        wire_format="pcm16",
    )

    assert ws.sent == [b"\x01\x02" * 480]


@pytest.mark.asyncio
async def test_receive_model_audio_converts_pcmu_for_phone_wire_format() -> None:
    content = SimpleNamespace(
        input_transcription=None,
        output_transcription=None,
        turn_complete=True,
        generation_complete=False,
        interrupted=False,
        model_turn=SimpleNamespace(
            parts=[SimpleNamespace(inline_data=SimpleNamespace(data=b"\x01\x02" * 480))]
        ),
    )
    ws = FakeWebSocket()

    await bridge._receive_model_audio(
        FakeSession([_response(content)]),
        ws,  # type: ignore[arg-type]
        "64b64b64b64b64b64b64b64b",
        {},
        bridge.PcmuLatency("64b64b64b64b64b64b64b64b"),
        FakeTranscript(),  # type: ignore[arg-type]
        wire_format="pcmu",
    )

    assert len(ws.sent) == 1
    assert len(ws.sent[0]) == 160


@pytest.mark.asyncio
async def test_publish_transcript_posts_dashboard_event(monkeypatch: pytest.MonkeyPatch) -> None:
    payloads: list[dict[str, Any]] = []

    async def fake_post_voice_event(payload: dict[str, Any]) -> bool:
        payloads.append(payload)
        return True

    transcript = FakeTranscript()
    monkeypatch.setattr(bridge, "post_voice_event", fake_post_voice_event)

    await bridge._publish_transcript(
        transcript, "64b64b64b64b64b64b64b64b", "user", " hello "
    )

    assert transcript.added == []
    assert transcript.flushes == 0
    assert payloads[0]["type"] == "call.transcript"
    assert payloads[0]["role"] == "user"
    assert payloads[0]["text"] == "hello"
    assert payloads[0]["callId"] == "64b64b64b64b64b64b64b64b"


@pytest.mark.asyncio
async def test_publish_transcript_falls_back_to_buffer(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_post_voice_event(payload: dict[str, Any]) -> bool:  # noqa: ARG001
        return False

    transcript = FakeTranscript()
    monkeypatch.setattr(bridge, "post_voice_event", fake_post_voice_event)

    await bridge._publish_transcript(
        transcript, "64b64b64b64b64b64b64b64b", "agent", "One moment."
    )

    assert transcript.added == [("agent", "One moment.")]
    assert transcript.flushes == 1


@pytest.mark.asyncio
async def test_warm_session_prepare_opens_live_gemini_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import warm_sessions

    manager = warm_sessions.WarmSessionManager()
    fake_live_session = object()
    fake_context = object()
    opened: dict[str, object] = {}

    async def fake_fetch_agent_for_call(agent_id: str, call_id: str) -> dict[str, object]:
        opened["fetch"] = (agent_id, call_id)
        return {"_id": agent_id, "tier": "gemini_live"}

    async def fake_build_system_prompt(agent: dict[str, object], prompt: str = "") -> str:
        opened["prompt"] = (agent, prompt)
        return "system prompt"

    async def fake_open_live_session(*, model: str, config: dict[str, object]) -> tuple[object, object]:
        opened["live"] = (model, config)
        return fake_context, fake_live_session

    monkeypatch.setattr(warm_sessions, "fetch_agent_for_call", fake_fetch_agent_for_call)
    monkeypatch.setattr(warm_sessions.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(warm_sessions, "build_system_prompt", fake_build_system_prompt)
    monkeypatch.setattr(warm_sessions, "gemini_live_model", lambda _agent: "models/test-live")
    monkeypatch.setattr(warm_sessions, "gemini_voice", lambda _agent: "Puck")
    monkeypatch.setattr(warm_sessions, "live_config", lambda *_args, **_kwargs: {"ok": True})
    monkeypatch.setattr(warm_sessions, "_open_live_session", fake_open_live_session)

    session = await manager.prepare("call-1", agent_id="agent-1", prompt="hello")

    assert session.agent["_id"] == "agent-1"
    assert session.system_prompt == "system prompt"
    assert session.live_session is fake_live_session
    assert session.live_context is fake_context
    assert session.preconnected is True
    assert opened["live"] == ("models/test-live", {"ok": True})
