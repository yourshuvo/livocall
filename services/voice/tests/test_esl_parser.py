"""ESL header / event parsing."""

from __future__ import annotations

from app.esl import EslEvent, _parse_headers


def test_parse_headers_decodes_url_encoding() -> None:
    raw = b"Event-Name: CHANNEL_HANGUP_COMPLETE\nUnique-ID: abc-123\nHangup-Cause: NORMAL_CLEARING\nvariable_call_doc_id: 5f9b2a%2D123\n"
    headers = _parse_headers(raw)
    assert headers["Event-Name"] == "CHANNEL_HANGUP_COMPLETE"
    assert headers["Unique-ID"] == "abc-123"
    assert headers["Hangup-Cause"] == "NORMAL_CLEARING"
    assert headers["variable_call_doc_id"] == "5f9b2a-123"


def test_event_uuid_falls_back_to_call_uuid() -> None:
    ev = EslEvent(headers={"Channel-Call-UUID": "cc-1"})
    assert ev.uuid == "cc-1"
    ev2 = EslEvent(headers={"Unique-ID": "u-1", "Channel-Call-UUID": "cc-1"})
    assert ev2.uuid == "u-1"
    ev3 = EslEvent(headers={})
    assert ev3.uuid == ""


def test_event_name_default_empty() -> None:
    ev = EslEvent(headers={})
    assert ev.name == ""
