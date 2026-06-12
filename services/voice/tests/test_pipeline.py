from __future__ import annotations

import asyncio

import pytest

from app.tiers import pipeline


def test_pipeline_defaults_to_speed_mode_for_low_latency() -> None:
    assert pipeline._pipeline_transcription_mode({}) == "speed"
    assert pipeline._pipeline_transcription_mode({"transcriptionMode": "accuracy"}) == "accuracy"
    assert pipeline._pipeline_transcription_mode({"transcriptionMode": "custom"}) == "custom"
    assert pipeline._pipeline_transcription_mode({"transcriptionMode": "bogus"}) == "speed"


def test_phone_pipeline_output_sample_rate_matches_audio_fork_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(pipeline.settings, "sample_rate_in", 16000)
    monkeypatch.setattr(pipeline.settings, "sample_rate_out", 24000)

    assert pipeline._phone_pipeline_output_sample_rate() == 16000


def test_pipeline_vad_idle_timeout_is_bounded_and_faster_than_pipecat_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(pipeline.settings, "pipecat_vad_audio_idle_timeout_secs", 0.35)

    assert pipeline._pipeline_vad_audio_idle_timeout_secs("speed") == 0.25
    assert pipeline._pipeline_vad_audio_idle_timeout_secs("accuracy") == 0.35
    assert pipeline._pipeline_vad_audio_idle_timeout_secs("custom") == 0.35

    monkeypatch.setattr(pipeline.settings, "pipecat_vad_audio_idle_timeout_secs", 2.0)
    assert pipeline._pipeline_vad_audio_idle_timeout_secs("accuracy") == 0.8

    monkeypatch.setattr(pipeline.settings, "pipecat_vad_audio_idle_timeout_secs", 0.05)
    assert pipeline._pipeline_vad_audio_idle_timeout_secs("accuracy") == 0.15

    monkeypatch.setattr(pipeline.settings, "pipecat_vad_audio_idle_timeout_secs", 0.0)
    assert pipeline._pipeline_vad_audio_idle_timeout_secs("accuracy") == 0.0


def test_pipeline_user_turn_stop_timeout_is_short_for_phone_calls() -> None:
    assert pipeline._pipeline_user_turn_stop_timeout_secs("speed") == 0.3
    assert pipeline._pipeline_user_turn_stop_timeout_secs("custom") == 0.5
    assert pipeline._pipeline_user_turn_stop_timeout_secs("accuracy") == 0.7


def test_soniox_tts_streams_tokens_for_low_latency_modes() -> None:
    from pipecat.services.tts_service import TextAggregationMode

    assert pipeline._soniox_tts_text_aggregation_mode("speed") == TextAggregationMode.TOKEN
    assert pipeline._soniox_tts_text_aggregation_mode("accuracy") == TextAggregationMode.TOKEN
    assert pipeline._soniox_tts_text_aggregation_mode("custom") == TextAggregationMode.SENTENCE


def test_pipeline_speaks_configured_opening_when_welcome_mode_is_ai() -> None:
    agent = {
        "prompt": {"firstMessage": "স্বাগতম, কীভাবে সাহায্য করতে পারি?"},
        "runtimeSettings": {"welcomeMode": "ai"},
        "language": "bn-BD",
    }

    assert pipeline._pipeline_opening_text(agent) == "স্বাগতম, কীভাবে সাহায্য করতে পারি?"


def test_pipeline_has_language_default_opening_when_ai_welcome_has_no_first_message() -> None:
    agent = {"runtimeSettings": {"welcomeMode": "ai"}, "language": "bn-BD"}

    assert pipeline._pipeline_opening_text(agent) == "হ্যালো, কীভাবে সাহায্য করতে পারি?"


def test_pipeline_respects_non_ai_welcome_modes() -> None:
    caller_first = {
        "prompt": {"firstMessage": "This should not play"},
        "runtimeSettings": {"welcomeMode": "caller"},
    }
    silent = {
        "prompt": {"firstMessage": "This should not play"},
        "runtimeSettings": {"welcomeMode": "silent"},
    }

    assert pipeline._pipeline_opening_text(caller_first) == ""
    assert pipeline._pipeline_opening_text(silent) == ""


def test_direct_opening_is_seeded_into_llm_context_so_user_reply_is_not_orphaned() -> None:
    messages = pipeline._initial_pipeline_context_messages(
        "system rules",
        opening_text="নমস্কার, আমি মার্ক বলছি।",
        opening_spoken_directly=True,
    )

    assert messages == [
        {"role": "system", "content": "system rules"},
        {"role": "assistant", "content": "নমস্কার, আমি মার্ক বলছি।"},
    ]


def test_unsent_opening_is_not_seeded_into_llm_context() -> None:
    messages = pipeline._initial_pipeline_context_messages(
        "system rules",
        opening_text="This has not played yet",
        opening_spoken_directly=False,
    )

    assert messages == [{"role": "system", "content": "system rules"}]


def test_pcm_stream_chunks_match_freeswitch_codec_frame_size(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(pipeline.settings, "sample_rate_in", 16000)
    monkeypatch.setattr(pipeline.settings, "fs_codec_ms", 20)

    chunks = pipeline._pcm_stream_chunks(bytes(range(256)) * 5)  # 1280 bytes total

    assert [len(chunk) for chunk in chunks] == [640, 640]


@pytest.mark.asyncio
async def test_audio_fork_output_uses_uuid_broadcast_instead_of_returning_websocket_bytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAudioForkWebSocket:
        def __init__(self) -> None:
            self.texts: list[str] = []
            self.bytes_payloads: list[bytes] = []

        async def send_text(self, text: str) -> None:
            self.texts.append(text)

        async def send_bytes(self, data: bytes) -> None:
            self.bytes_payloads.append(data)

    broadcasts: list[tuple[str, bytes]] = []

    async def fake_broadcast(call_id: str, audio: bytes) -> bool:
        broadcasts.append((call_id, audio))
        return True

    monkeypatch.setattr(pipeline.settings, "sample_rate_in", 16000)
    monkeypatch.setattr(pipeline, "_broadcast_audio_to_freeswitch", fake_broadcast)
    ws = FakeAudioForkWebSocket()

    await pipeline._send_audio_to_freeswitch(ws, "call-1", b"\x01\x02")

    assert broadcasts == [("call-1", b"\x01\x02")]
    assert ws.bytes_payloads == []
    assert ws.texts == []


@pytest.mark.asyncio
async def test_broadcast_sink_flushes_during_continuous_tts_without_waiting_for_silence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    broadcasts: list[bytes] = []

    async def fake_broadcast(_call_id: str, audio: bytes) -> bool:
        broadcasts.append(audio)
        return True

    monkeypatch.setattr(pipeline, "_broadcast_audio_to_freeswitch", fake_broadcast)
    sink = pipeline._FreeswitchBroadcastSink(
        "call-1",
        debounce_secs=10.0,
        flush_interval_secs=0.03,
    )

    await sink.write(b"first-")
    await asyncio.sleep(0.015)
    await sink.write(b"second")
    await asyncio.sleep(0.04)

    assert broadcasts == [b"first-second"]


@pytest.mark.asyncio
async def test_audio_fork_serializer_decodes_and_encodes_raw_pcm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pipecat.frames.frames import InputAudioRawFrame, OutputAudioRawFrame

    monkeypatch.setattr(pipeline.settings, "sample_rate_in", 16000)
    serializer = pipeline._audio_fork_serializer()

    inbound = await serializer.deserialize(b"\x01\x02")
    assert isinstance(inbound, InputAudioRawFrame)
    assert inbound.audio == b"\x01\x02"
    assert inbound.sample_rate == 16000
    assert inbound.num_channels == 1

    outbound = await serializer.serialize(
        OutputAudioRawFrame(audio=b"\x03\x04", sample_rate=16000, num_channels=1)
    )
    assert outbound == b"\x03\x04"


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[bytes] = []
        self.closed: list[int] = []
        self._messages = [
            {"type": "websocket.receive", "bytes": b"caller audio"},
            {"type": "websocket.disconnect"},
        ]

    async def receive(self) -> dict[str, object]:
        return self._messages.pop(0)

    async def send_bytes(self, data: bytes) -> None:
        self.sent.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed.append(code)


@pytest.mark.asyncio
async def test_pipeline_missing_keys_closes_without_echoing_caller_audio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_fetch_agent_for_call(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {}

    monkeypatch.setattr(pipeline, "fetch_agent_for_call", fake_fetch_agent_for_call)
    monkeypatch.setattr(pipeline.settings, "gemini_api_key", "")
    monkeypatch.setattr(pipeline.settings, "soniox_api_key", "")

    ws = FakeWebSocket()
    await pipeline.PipelineTier().run(ws, call_id="call-1", agent_id="agent-1")

    assert ws.sent == []
    assert ws.closed == [1011]
