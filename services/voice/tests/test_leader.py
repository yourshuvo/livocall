"""Leader-lock fallback behaviour without Redis."""

from __future__ import annotations

import pytest

from app import leader


async def test_noop_when_redis_url_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setattr(leader.settings, "redis_url", "")
    async with leader.LeaderLock("unit-test") as lock:
        assert lock.held is True
    # held resets on exit
    assert lock.held is False


async def test_key_is_namespaced() -> None:
    lock = leader.LeaderLock("my-worker")
    assert lock.key == "livocall:lock:my-worker"


async def test_ttl_default_is_30() -> None:
    lock = leader.LeaderLock("x")
    assert lock.ttl == 30
