"""HMAC signing / verification for /ws/audio query-string auth."""

from __future__ import annotations

import time

import pytest

from app import ws_auth


def test_verify_allows_any_when_secret_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws_auth.settings, "voice_ws_shared_secret", "")
    assert ws_auth.verify("any-id", None) is True
    assert ws_auth.verify("any-id", "whatever") is True


def test_sign_and_verify_roundtrip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws_auth.settings, "voice_ws_shared_secret", "secretkey")
    monkeypatch.setattr(ws_auth.settings, "voice_ws_auth_ttl_seconds", 60)
    token = ws_auth.sign("call-123")
    assert "." in token
    assert ws_auth.verify("call-123", token) is True


def test_verify_rejects_bad_call_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws_auth.settings, "voice_ws_shared_secret", "secretkey")
    token = ws_auth.sign("call-123")
    assert ws_auth.verify("other-call", token) is False


def test_verify_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws_auth.settings, "voice_ws_shared_secret", "secretkey")
    past = int(time.time()) - 10
    token = ws_auth.sign("call-123", expires=past)
    assert ws_auth.verify("call-123", token) is False


def test_verify_rejects_malformed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws_auth.settings, "voice_ws_shared_secret", "secretkey")
    assert ws_auth.verify("call-123", None) is False
    assert ws_auth.verify("call-123", "") is False
    assert ws_auth.verify("call-123", "no-dot") is False
    assert ws_auth.verify("call-123", "abc.def") is False
