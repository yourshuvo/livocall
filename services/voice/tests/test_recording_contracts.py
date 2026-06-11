from __future__ import annotations

from pathlib import Path


RECORD_ACTION = 'application="record_session" data="${recordings_dir}/${call_doc_id}.wav"'


def test_phone_dialplan_records_by_call_doc_id_after_answer() -> None:
    xml = Path("infra/freeswitch/dialplan/default/00_livocall_outbound.xml").read_text()

    assert RECORD_ACTION in xml
    assert "execute_on_answer=record_session" not in xml
    assert "${recordings_dir}/${uuid}.wav" not in xml


def test_phone_dialplan_starts_recording_before_audio_fork() -> None:
    xml = Path("infra/freeswitch/dialplan/default/00_livocall_outbound.xml").read_text()

    record_idx = xml.index(RECORD_ACTION)
    fork_idx = xml.index('application="audio_fork"')

    assert record_idx < fork_idx
