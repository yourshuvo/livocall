"""Smoke tests for app.persistence."""

from __future__ import annotations

from typing import Any

import pytest

from app import persistence


class FakeUpdates:
    def __init__(self) -> None:
        self.updates: list[tuple[dict[str, Any], dict[str, Any]]] = []

    async def update_one(self, flt: dict[str, Any], upd: dict[str, Any]) -> None:
        self.updates.append((flt, upd))

    async def find_one(self, flt: dict[str, Any]) -> dict[str, Any] | None:
        return getattr(self, "_doc", None)


def _install_fake_db(monkeypatch: pytest.MonkeyPatch) -> FakeUpdates:
    fake = FakeUpdates()

    def _get_db() -> dict[str, FakeUpdates]:
        return {"calls": fake}

    monkeypatch.setattr(persistence, "get_db", _get_db)
    return fake


@pytest.mark.asyncio
async def test_transcript_buffer_flushes_turns(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install_fake_db(monkeypatch)
    # A valid 24-char hex string so ObjectId.is_valid returns True.
    buf = persistence.TranscriptBuffer(call_id="64b64b64b64b64b64b64b64b")
    await buf.add("user", "hi there")
    await buf.add("agent", "")  # ignored
    await buf.add("agent", "hello")
    await buf.flush()
    assert len(fake.updates) == 1
    _, upd = fake.updates[0]
    turns = upd["$push"]["transcript"]["$each"]
    assert [t["role"] for t in turns] == ["user", "agent"]
    assert turns[0]["text"] == "hi there"


@pytest.mark.asyncio
async def test_transcript_buffer_ignores_invalid_call_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _install_fake_db(monkeypatch)
    buf = persistence.TranscriptBuffer(call_id="not-an-object-id")
    await buf.add("user", "ignored")
    await buf.flush()
    assert fake.updates == []


def test_heuristic_summary_empty() -> None:
    out = persistence._heuristic_summary([])
    assert out[1] == "neutral"
    assert "no transcribed turns" in out[0].lower()


def test_heuristic_summary_trails_last_turns() -> None:
    turns = [
        {"role": "user", "text": "hi"},
        {"role": "agent", "text": "hello, how can I help?"},
        {"role": "user", "text": "I want to check my balance"},
        {"role": "agent", "text": "your balance is 500 taka"},
    ]
    summary, sentiment = persistence._heuristic_summary(turns)
    assert sentiment == "neutral"
    assert "4-turn call" in summary


@pytest.mark.asyncio
async def test_summarize_call_skips_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _install_fake_db(monkeypatch)
    monkeypatch.setattr(persistence.settings, "summarizer_enabled", False)
    out = await persistence.summarize_call("64b64b64b64b64b64b64b64b")
    assert out is None
    assert fake.updates == []


@pytest.mark.asyncio
async def test_summarize_call_uses_heuristic_without_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _install_fake_db(monkeypatch)
    fake._doc = {  # type: ignore[attr-defined]
        "_id": "any",
        "transcript": [
            {"role": "user", "text": "wanted to confirm my order"},
            {"role": "agent", "text": "confirmed — will ship tomorrow"},
        ],
    }
    monkeypatch.setattr(persistence.settings, "summarizer_enabled", True)
    monkeypatch.setattr(persistence.settings, "gemini_api_key", "")
    out = await persistence.summarize_call("64b64b64b64b64b64b64b64b")
    assert out is not None
    assert out["sentiment"] == "neutral"
    assert fake.updates and "summary" in fake.updates[0][1]["$set"]


@pytest.mark.asyncio
async def test_upload_recording_missing_file(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(persistence.settings, "recordings_local_dir", str(tmp_path))
    out = await persistence.upload_recording("64b64b64b64b64b64b64b64b")
    assert out is None


@pytest.mark.asyncio
async def test_upload_recording_local_fallback(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _install_fake_db(monkeypatch)
    call_id = "64b64b64b64b64b64b64b64b"
    monkeypatch.setattr(persistence.settings, "recordings_local_dir", str(tmp_path))
    monkeypatch.setattr(persistence.settings, "s3_recordings_bucket", "")
    p = tmp_path / f"{call_id}.wav"
    p.write_bytes(b"RIFFfake")
    url = await persistence.upload_recording(call_id)
    assert url is not None
    assert url.startswith("file://")
    assert fake.updates and fake.updates[0][1]["$set"]["audioUrl"] == url
