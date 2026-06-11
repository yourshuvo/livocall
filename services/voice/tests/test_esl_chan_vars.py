"""Regression tests for the ``{key=val,…}`` chan-var encoder used by
``EslClient.originate``. URLs and HMAC tokens contain ``,`` ``=`` ``&`` and
braces, so the values must be quoted before they hit FreeSWITCH."""

from __future__ import annotations

import pytest

from app.esl import EslClient, EslConfig, _build_chan_vars, _quote_chan_var
from app.originator import audio_fork_args


def test_quotes_value_with_comma() -> None:
    assert _quote_chan_var("a,b,c") == "'a,b,c'"


def test_strips_dangerous_chars() -> None:
    # Single quote, brace, and newline must be removed because we use single
    # quotes as the wrapping delimiter and ``}`` terminates the chan-var block.
    assert _quote_chan_var("o'malley") == "'omalley'"
    assert _quote_chan_var("a}b") == "'ab'"
    assert _quote_chan_var("a\nb") == "'ab'"
    assert _quote_chan_var("a\r\nb") == "'ab'"


def test_build_chan_vars_quotes_each_value() -> None:
    block = _build_chan_vars(
        {
            "origination_uuid": "11111111-2222-3333-4444-555555555555",
            "livocall_ws_url": "ws://h:8084/ws/audio?call_id=abc&auth=def&meta=k:v",
            "livocall_disclosure_url": "https://s3/bucket/file.wav?token=x&exp=1",
        }
    )
    # Each value must be single-quoted so commas / & / = inside the URL don't
    # confuse the FreeSWITCH chan-var parser.
    assert "origination_uuid='11111111-2222-3333-4444-555555555555'" in block
    assert "livocall_ws_url='ws://h:8084/ws/audio?call_id=abc&auth=def&meta=k:v'" in block
    assert (
        "livocall_disclosure_url='https://s3/bucket/file.wav?token=x&exp=1'"
        in block
    )
    # Entries are still comma-separated at the top level.
    parts = block.split("',")
    assert len(parts) == 3


def test_build_chan_vars_empty_value_still_emits_key() -> None:
    block = _build_chan_vars({"livocall_consent_prompt": "", "tier": "pipeline"})
    assert block == "livocall_consent_prompt='',tier='pipeline'"


def test_audio_fork_args_include_low_latency_buffers() -> None:
    args = audio_fork_args("ws://voice:8084/ws/audio?call_id=abc")
    assert args == "ws://voice:8084/ws/audio?call_id=abc mono 16000 buffer 20 jitterbuffer 20"


def test_audio_fork_args_use_8k_for_pcmu_bridge() -> None:
    args = audio_fork_args("ws://voice:8084/ws/audio-pcmu?call_id=abc")
    assert args == "ws://voice:8084/ws/audio-pcmu?call_id=abc mono 8000 buffer 20 jitterbuffer 20"


@pytest.mark.asyncio
async def test_originate_routes_answered_leg_through_livocall_dialplan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commands: list[str] = []
    client = EslClient(EslConfig(host="127.0.0.1", port=8021, password="ClueCon"))

    async def _fake_bgapi(command: str) -> str:
        commands.append(command)
        return "+OK"

    monkeypatch.setattr(client, "bgapi", _fake_bgapi)
    channel_uuid = "11111111-2222-3333-4444-555555555555"

    result = await client.originate(
        gateway="sip_j",
        to_e164="+8801712345678",
        agent_id="agent-1",
        tier="pipeline",
        from_e164="+8809612345678",
        ws_url="ws://voice:8084/ws/audio?call_id=abc&auth=def mono 16000 buffer 20 jitterbuffer 20",
        call_doc_id="call-1",
        channel_uuid=channel_uuid,
    )

    assert result == channel_uuid
    assert len(commands) == 1
    command = commands[0]
    assert "livocall_park='1'" in command
    assert (
        "livocall_ws_url='ws://voice:8084/ws/audio?call_id=abc&auth=def mono 16000 buffer 20 jitterbuffer 20'"
        in command
    )
    assert "&park" not in command
    assert command.endswith("sofia/gateway/sip_j/+8801712345678 livocall_park XML default")


@pytest.mark.asyncio
async def test_eavesdrop_listen_originates_passive_supervisor_leg(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commands: list[str] = []
    client = EslClient(EslConfig(host="127.0.0.1", port=8021, password="ClueCon"))

    async def _fake_bgapi(command: str) -> str:
        commands.append(command)
        return "+OK"

    monkeypatch.setattr(client, "bgapi", _fake_bgapi)
    supervisor_uuid = "11111111-2222-3333-4444-555555555555"
    source_uuid = "66666666-7777-8888-9999-000000000000"

    result = await client.eavesdrop(
        gateway="sip_custom",
        target_e164="+8801712345678",
        from_e164="+8809610000000",
        source_uuid=source_uuid,
        supervisor_uuid=supervisor_uuid,
        action="listen",
    )

    assert result == supervisor_uuid
    assert commands == [
        (
            "originate {origination_uuid='11111111-2222-3333-4444-555555555555',"
            "origination_caller_id_number='+8809610000000',"
            "livocall_supervisor_action='listen',"
            "livocall_supervisor_source_uuid='66666666-7777-8888-9999-000000000000'}"
            "sofia/gateway/sip_custom/+8801712345678 "
            "&eavesdrop(66666666-7777-8888-9999-000000000000)"
        )
    ]


@pytest.mark.asyncio
async def test_eavesdrop_barge_queues_three_way_dtmf(monkeypatch: pytest.MonkeyPatch) -> None:
    commands: list[str] = []
    client = EslClient(EslConfig(host="127.0.0.1", port=8021, password="ClueCon"))

    async def _fake_bgapi(command: str) -> str:
        commands.append(command)
        return "+OK"

    monkeypatch.setattr(client, "bgapi", _fake_bgapi)
    source_uuid = "66666666-7777-8888-9999-000000000000"

    await client.eavesdrop(
        gateway="sip_custom",
        target_e164="+8801712345678",
        from_e164="+8809610000000",
        source_uuid=source_uuid,
        supervisor_uuid="11111111-2222-3333-4444-555555555555",
        action="barge",
    )

    assert "'queue_dtmf:w3@500,eavesdrop:66666666-7777-8888-9999-000000000000' inline" in commands[0]
