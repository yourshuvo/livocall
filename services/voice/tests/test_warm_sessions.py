from __future__ import annotations

from app.warm_sessions import warm_sessions


async def test_warm_session_prepare_and_pop() -> None:
    session = await warm_sessions.prepare(
        "call-1",
        agent_id="not-an-object-id",
        prompt="hello",
        metadata={"campaign": "c1"},
    )

    assert session.call_id == "call-1"
    assert session.prompt == "hello"
    assert session.metadata == {"campaign": "c1"}
    assert session.model == "models/gemini-3.1-flash-live-preview"

    popped = await warm_sessions.pop("call-1")
    assert popped is session
    assert await warm_sessions.pop("call-1") is None
