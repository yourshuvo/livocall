from __future__ import annotations

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


def test_soniox_tts_streams_tokens_for_low_latency_modes() -> None:
    from pipecat.services.tts_service import TextAggregationMode

    assert pipeline._soniox_tts_text_aggregation_mode("speed") == TextAggregationMode.TOKEN
    assert pipeline._soniox_tts_text_aggregation_mode("accuracy") == TextAggregationMode.TOKEN
    assert pipeline._soniox_tts_text_aggregation_mode("custom") == TextAggregationMode.SENTENCE


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
