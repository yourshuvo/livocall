from __future__ import annotations

from datetime import UTC, datetime

from app.web_client import _json_safe


def test_json_safe_serializes_utc_datetimes_with_z() -> None:
    payload = {
        "startedAt": datetime(2026, 5, 29, 9, 8, 27, tzinfo=UTC),
        "nested": {"at": "2026-05-29T09:08:27+00:00"},
    }

    assert _json_safe(payload) == {
        "startedAt": "2026-05-29T09:08:27Z",
        "nested": {"at": "2026-05-29T09:08:27Z"},
    }
