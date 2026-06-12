from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

import pytest
from bson import ObjectId

from app import originator


class FakeCollection:
    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self.docs = docs

    async def find_one(self, flt: dict[str, Any]) -> dict[str, Any] | None:
        for doc in self.docs:
            if _matches(doc, flt):
                return doc
        return None


def _matches(doc: dict[str, Any], flt: dict[str, Any]) -> bool:
    for key, expected in flt.items():
        actual = doc.get(key)
        if isinstance(expected, dict):
            for op, value in expected.items():
                if op == "$exists" and ((key in doc) is not bool(value)):
                    return False
                if op == "$ne" and actual == value:
                    return False
            continue
        if actual != expected:
            return False
    return True


def test_audio_fork_args_enable_bidirectional_json_playback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(originator.settings, "sample_rate_in", 16000)
    monkeypatch.setattr(originator.settings, "audio_fork_buffer_ms", 20)
    monkeypatch.setattr(originator.settings, "audio_fork_jitter_buffer_ms", 20)

    args = originator.audio_fork_args("ws://10.0.1.9:8084/ws/audio?call_id=call-1")

    assert args == "ws://10.0.1.9:8084/ws/audio?call_id=call-1 mono 16000 livocall null true false 16000"
    assert "buffer" not in args
    assert "jitterbuffer" not in args


@pytest.mark.asyncio
async def test_requested_from_number_does_not_force_stale_non_outbound_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org_id = ObjectId()
    stale_cli = "+8809639148184"
    monkeypatch.setattr(originator.settings, "fs_default_gateway", "sip_j")
    monkeypatch.setattr(originator.settings, "default_outbound_caller_id", stale_cli)
    monkeypatch.setattr(
        originator,
        "get_db",
        lambda: {
            "phonenumbers": FakeCollection(
                [
                    {
                        "orgId": org_id,
                        "e164": stale_cli,
                        "providerSlug": "sip_103_15_140_151",
                        "outboundEnabled": False,
                    }
                ]
            )
        },
    )

    gateway, cli = await originator.resolve_outbound_gateway(str(org_id), "agent-1", stale_cli)

    assert gateway == "sip_j"
    assert cli == stale_cli


@pytest.mark.asyncio
async def test_requested_from_number_uses_matching_gateway_when_outbound_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org_id = ObjectId()
    cli = "+8809639148184"
    monkeypatch.setattr(
        originator,
        "get_db",
        lambda: {
            "phonenumbers": FakeCollection(
                [
                    {
                        "orgId": org_id,
                        "e164": cli,
                        "providerSlug": "sip_j",
                        "outboundEnabled": True,
                    }
                ]
            )
        },
    )

    gateway, selected_cli = await originator.resolve_outbound_gateway(str(org_id), "agent-1", cli)

    assert gateway == "sip_j"
    assert selected_cli == cli


@pytest.mark.asyncio
async def test_dashboard_test_calls_prefer_default_gateway_even_with_stale_phone_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org_id = ObjectId()
    cli = "+8809639148184"
    monkeypatch.setattr(originator.settings, "fs_default_gateway", "sip_custom")
    monkeypatch.setattr(originator.settings, "fs_dashboard_test_gateway", "sip_j")
    monkeypatch.setattr(
        originator,
        "get_db",
        lambda: {
            "phonenumbers": FakeCollection(
                [
                    {
                        "orgId": org_id,
                        "e164": cli,
                        "providerSlug": "sip_103_15_140_151",
                        "outboundEnabled": True,
                    }
                ]
            )
        },
    )

    gateway, selected_cli = await originator.resolve_outbound_gateway(
        str(org_id), "agent-1", cli, prefer_default_gateway=True
    )

    assert gateway == "sip_j"
    assert selected_cli == cli


def test_build_ws_url_uses_private_container_bridge_for_same_host_audio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(originator.settings, "voice_ws_public_url", "wss://voice.livocall.com/ws/audio")
    monkeypatch.setattr(originator.settings, "voice_ws_bridge_autodetect_enabled", True, raising=False)
    monkeypatch.setattr(originator.settings, "voice_ws_internal_port", 8084, raising=False)
    monkeypatch.setattr(originator, "_container_bridge_ipv4", lambda: "10.0.1.9")

    url = originator.build_ws_url(
        call_doc_id="call-1",
        agent_id="agent-1",
        tier="pipeline",
        metadata={"source": "dashboard-test"},
    )

    parsed = urlsplit(url)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == "ws://10.0.1.9:8084/ws/audio"
    assert "call_id=call-1" in parsed.query
