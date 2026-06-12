from __future__ import annotations

import re
import time
import uuid
import wave
from dataclasses import dataclass
from pathlib import Path

from app.settings import settings


@dataclass(frozen=True)
class PlaybackEntry:
    path: Path
    expires_at: float


_entries: dict[str, PlaybackEntry] = {}


def _safe_call_id(call_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", call_id).strip("-._")
    return (safe or "call")[:64]


def _cleanup_expired(now: float | None = None) -> None:
    current = time.time() if now is None else now
    expired = [token for token, entry in _entries.items() if entry.expires_at <= current]
    for token in expired:
        entry = _entries.pop(token, None)
        if entry is not None:
            try:
                entry.path.unlink(missing_ok=True)
            except OSError:
                pass


def write_pcm_wav(call_id: str, audio: bytes, *, sample_rate: int) -> str:
    """Persist mono signed-16-bit PCM as a short-lived WAV and return its token."""

    if not audio:
        return ""
    _cleanup_expired()
    directory = Path(settings.playback_cache_dir)
    directory.mkdir(parents=True, exist_ok=True)
    token = uuid.uuid4().hex
    path = directory / f"{_safe_call_id(call_id)}-{token}.wav"
    # Keep sample boundaries intact for wave/sndfile readers.
    if len(audio) % 2:
        audio += b"\x00"
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(audio)
    _entries[token] = PlaybackEntry(
        path=path,
        expires_at=time.time() + max(30, int(settings.playback_ttl_seconds)),
    )
    return token


def lookup(token: str) -> Path | None:
    _cleanup_expired()
    entry = _entries.get(token)
    if entry is None or not entry.path.exists():
        return None
    return entry.path


def remove(token: str) -> None:
    entry = _entries.pop(token, None)
    if entry is not None:
        try:
            entry.path.unlink(missing_ok=True)
        except OSError:
            pass
