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


def _transcription(text: str) -> SimpleNamespace:
    return SimpleNamespace(text=text)


def _response(content: Any = None, tool_call: Any = None) -> SimpleNamespace:
    return SimpleNamespace(server_content=content, tool_call=tool_call)


def test_live_config_enables_audio_transcription() -> None:
    config = bridge._live_config(FakeTypes, "Answer fast.", "Puck", {})

    assert config["response_modalities"] == ["AUDIO"]
    assert config["input_audio_transcription"] == {}
    assert config["output_audio_transcription"] == {}
    assert config["thinking_config"] == {"thinking_level": "minimal"}


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
        model_turn=None,
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
