from __future__ import annotations

from typing import Any

import pytest
from bson import ObjectId

from app import originator

CALL_ID = ObjectId("64b64b64b64b64b64b64b64b")
ORG_ID = ObjectId("65b65b65b65b65b65b65b65b")
AGENT_ID = ObjectId("66b66b66b66b66b66b66b66b")


class FakeCalls:
    def __init__(self, doc: dict[str, Any]) -> None:
        self.doc = doc

    async def find_one(self, flt: dict[str, Any]) -> dict[str, Any] | None:
        if flt.get("_id") == CALL_ID or flt.get("fsUuid") == self.doc["fsUuid"]:
            return self.doc
        return None


def _fake_db(doc: dict[str, Any]) -> dict[str, Any]:
    return {"calls": FakeCalls(doc)}


@pytest.mark.asyncio
async def test_control_call_fake_driver_returns_supervisor_leg_uuid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    doc = {
        "_id": CALL_ID,
        "orgId": ORG_ID,
        "agentId": AGENT_ID,
        "fsUuid": "66666666-7777-8888-9999-000000000000",
    }
    monkeypatch.setattr(originator, "get_db", lambda: _fake_db(doc))
    monkeypatch.setattr(originator.settings, "voice_fake_driver", True)

    result = await originator.control_call(
        str(CALL_ID),
        action="listen",
        supervisor_id="user-1",
        target_e164="+8801712345678",
    )

    assert result["ok"] is True
    assert result["action"] == "listen"
    assert isinstance(result["supervisorLegUuid"], str)


@pytest.mark.asyncio
async def test_control_call_rejects_unsupported_action(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(originator.settings, "voice_fake_driver", True)

    with pytest.raises(ValueError, match="unsupported supervisor action"):
        await originator.control_call(
            str(CALL_ID),
            action="whisper",
            supervisor_id="user-1",
            target_e164="+8801712345678",
        )
