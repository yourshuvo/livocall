"""Hangup-cause to outcome mapping + the ESL → Mongo bridge."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app import event_bridge
from app.esl import EslEvent
from app.event_bridge import _outcome_from_cause


@pytest.mark.parametrize(
    "cause,outcome",
    [
        ("NORMAL_CLEARING", "completed"),
        ("NONE", "completed"),
        ("NO_ANSWER", "no_answer"),
        ("ALLOTTED_TIMEOUT", "no_answer"),
        ("USER_BUSY", "busy"),
        ("UNALLOCATED_NUMBER", "failed"),
        ("CALL_REJECTED", "failed"),
        ("VOICEMAIL_LEFT", "voicemail"),
    ],
)
def test_outcome_from_cause(cause: str, outcome: str) -> None:
    assert _outcome_from_cause(cause) == outcome


CALL_OID_HEX = "64b64b64b64b64b64b64b64b"


class FakeCalls:
    """Minimal Mongo-collection stand-in capturing update_one calls."""

    def __init__(self, doc: dict[str, Any] | None) -> None:
        self.doc = doc
        self.updates: list[tuple[dict[str, Any], Any]] = []

    async def find_one(self, _flt: dict[str, Any]) -> dict[str, Any] | None:
        return self.doc

    async def update_one(self, flt: dict[str, Any], upd: Any) -> None:
        self.updates.append((flt, upd))


async def _no_post(_payload: dict[str, Any]) -> bool:
    return True


def _install_fake(
    monkeypatch: pytest.MonkeyPatch, doc: dict[str, Any] | None
) -> FakeCalls:
    fake = FakeCalls(doc)

    def _get_db() -> dict[str, FakeCalls]:
        return {"calls": fake}

    monkeypatch.setattr(event_bridge, "get_db", _get_db)
    monkeypatch.setattr(event_bridge, "post_voice_event", _no_post)

    # Block finalize_call from spawning real follow-up work in the bg.
    class _DummyTask:
        def cancel(self) -> None:
            pass

    def _fake_create_task(coro: Any, *_args: Any, **_kwargs: Any) -> _DummyTask:
        coro.close()
        return _DummyTask()

    monkeypatch.setattr(event_bridge.asyncio, "create_task", _fake_create_task)
    return fake


@pytest.mark.asyncio
async def test_channel_answer_marks_call_answered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _install_fake(monkeypatch, {"_id": CALL_OID_HEX, "tier": "pipeline"})
    ev = EslEvent(
        headers={
            "Event-Name": "CHANNEL_ANSWER",
            "variable_call_doc_id": CALL_OID_HEX,
        }
    )

    await event_bridge.on_event(ev)

    assert fake.updates, "expected answeredAt update"
    _, upd = fake.updates[0]
    assert "answeredAt" in upd["$set"]


@pytest.mark.asyncio
async def test_billsec_zero_does_not_fall_back_to_wallclock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``billsec=0`` is FreeSWITCH telling us the call wasn't billed (e.g.
    rejected before answer). We MUST trust that and write 0 — falling back to
    ``now - startedAt`` would bill the ringing time."""
    fake = _install_fake(
        monkeypatch,
        {
            "_id": CALL_OID_HEX,
            "tier": "pipeline",
            "startedAt": datetime(2025, 1, 1, tzinfo=UTC),
        },
    )
    ev = EslEvent(
        headers={
            "Event-Name": "CHANNEL_HANGUP_COMPLETE",
            "variable_call_doc_id": CALL_OID_HEX,
            "variable_billsec": "0",
            "Hangup-Cause": "NO_ANSWER",
        }
    )
    await event_bridge.on_event(ev)

    assert fake.updates, "expected an update on the calls collection"
    _, upd = fake.updates[0]
    assert upd["$set"]["durationSec"] == 0
    assert upd["$set"]["outcome"] == "no_answer"


@pytest.mark.asyncio
async def test_missing_billsec_falls_back_to_wallclock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = datetime.now(UTC).replace(microsecond=0)
    fake = _install_fake(
        monkeypatch,
        {"_id": CALL_OID_HEX, "tier": "pipeline", "startedAt": started},
    )
    ev = EslEvent(
        headers={
            "Event-Name": "CHANNEL_HANGUP_COMPLETE",
            "variable_call_doc_id": CALL_OID_HEX,
            "Hangup-Cause": "NORMAL_CLEARING",
            # no variable_billsec → fall back to wall-clock
        }
    )
    await event_bridge.on_event(ev)

    assert fake.updates
    _, upd = fake.updates[0]
    assert upd["$set"]["durationSec"] >= 0
    assert upd["$set"]["outcome"] == "completed"


@pytest.mark.asyncio
async def test_dtmf_uses_aggregation_pipeline_concat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DTMF append must be atomic — expressed as a Mongo aggregation pipeline
    using ``$concat``, not a read-then-write."""
    fake = _install_fake(monkeypatch, {"_id": CALL_OID_HEX, "dtmfPath": "12"})

    ev = EslEvent(
        headers={
            "Event-Name": "DTMF",
            "variable_call_doc_id": CALL_OID_HEX,
            "DTMF-Digit": "3",
        }
    )
    await event_bridge.on_event(ev)

    assert fake.updates, "expected a DTMF update"
    _, upd = fake.updates[0]
    assert isinstance(upd, list), "DTMF update must be an aggregation pipeline"
    stage = upd[0]["$set"]["dtmfPath"]
    assert "$concat" in stage
    assert stage["$concat"][1] == "3"
