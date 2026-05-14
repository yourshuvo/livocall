"""Regression tests for the ``{key=val,…}`` chan-var encoder used by
``EslClient.originate``. URLs and HMAC tokens contain ``,`` ``=`` ``&`` and
braces, so the values must be quoted before they hit FreeSWITCH."""

from __future__ import annotations

from app.esl import _build_chan_vars, _quote_chan_var
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
