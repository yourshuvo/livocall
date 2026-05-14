"""Worker smoke tests — exercise pure helpers and the lifecycle hooks
without touching real Mongo or making real network calls."""

from __future__ import annotations

from datetime import UTC, datetime

from app.workers.campaign_dialer import _is_in_schedule, _is_in_window
from app.workers.kb_ingestion import _chunk_text, _hash_embedding


class TestCampaignWindows:
    def test_in_window_simple(self) -> None:
        # 10:00 UTC is in window 9-18
        now = datetime(2025, 1, 1, 10, 0, tzinfo=UTC)
        assert _is_in_window(now, {"timezone": "UTC", "windows": [{"from": 540, "to": 1080}]})

    def test_outside_window(self) -> None:
        now = datetime(2025, 1, 1, 8, 0, tzinfo=UTC)
        assert not _is_in_window(now, {"timezone": "UTC", "windows": [{"from": 540, "to": 1080}]})

    def test_window_wraps_midnight(self) -> None:
        now = datetime(2025, 1, 1, 23, 30, tzinfo=UTC)
        assert _is_in_window(
            now, {"timezone": "UTC", "windows": [{"from": 1380, "to": 360}]}
        )

    def test_schedule_respects_dates(self) -> None:
        sched = {
            "timezone": "UTC",
            "windows": [{"from": 0, "to": 1440}],
            "startAt": datetime(2030, 1, 1, tzinfo=UTC),
        }
        assert not _is_in_schedule(datetime(2025, 1, 1, tzinfo=UTC), sched)


class TestKbChunking:
    def test_chunks_short_text(self) -> None:
        chunks = _chunk_text("hello world")
        assert chunks == ["hello world"]

    def test_chunks_long_text(self) -> None:
        text = "x" * 2500
        chunks = _chunk_text(text)
        # 2500 chars, 1000 chunk size, 100 overlap → first chunk 0..1000,
        # second 900..1900, third 1800..2500 → 3 chunks.
        assert len(chunks) == 3
        assert all(len(c) <= 1000 for c in chunks)

    def test_hash_embedding_deterministic(self) -> None:
        a = _hash_embedding("hello")
        b = _hash_embedding("hello")
        assert a == b
        assert len(a) == 128

    def test_hash_embedding_differs(self) -> None:
        assert _hash_embedding("hello") != _hash_embedding("goodbye")
