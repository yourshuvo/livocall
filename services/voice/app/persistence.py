"""Post-call persistence: transcript turns, recording upload, AI summary.

Every function here is best-effort and never raises to the caller. Failure to
summarize a call must not block the hangup event pipeline.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import structlog
from bson import ObjectId

from app.db import get_db
from app.settings import settings

log = structlog.get_logger()


@dataclass(slots=True)
class Turn:
    role: str  # 'user' | 'agent' | 'system'
    text: str
    at: datetime


# ---------------------------------------------------------------------------
# Transcript buffering
# ---------------------------------------------------------------------------

class TranscriptBuffer:
    """Accumulates turns in-memory and flushes to Mongo in batches.

    One buffer per live call. Flushes automatically when ``flush()`` is awaited
    (typically from the tier ``run()`` finally block) and also when the pending
    queue exceeds ``max_pending``. Turns append to ``calls.transcript``.
    """

    def __init__(self, call_id: str, max_pending: int = 20) -> None:
        self.call_id = call_id
        self.max_pending = max_pending
        self._pending: list[Turn] = []
        self._lock = asyncio.Lock()

    async def add(self, role: str, text: str) -> None:
        text = text.strip()
        if not text:
            return
        async with self._lock:
            self._pending.append(Turn(role=role, text=text, at=datetime.now(UTC)))
            should_flush = len(self._pending) >= self.max_pending
        if should_flush:
            await self.flush()

    async def flush(self) -> None:
        async with self._lock:
            turns = list(self._pending)
            self._pending.clear()
        if not turns:
            return
        if not ObjectId.is_valid(self.call_id):
            return
        try:
            db = get_db()
            await db["calls"].update_one(
                {"_id": ObjectId(self.call_id)},
                {
                    "$push": {
                        "transcript": {
                            "$each": [
                                {"role": t.role, "text": t.text, "at": t.at} for t in turns
                            ]
                        }
                    }
                },
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("transcript.flush_failed", error=str(exc), call_id=self.call_id)


def context_transcript_turns(context_or_messages: Any) -> list[tuple[str, str]]:
    messages = getattr(context_or_messages, "messages", context_or_messages) or []
    turns: list[tuple[str, str]] = []
    for msg in messages:
        role, text = _context_message_role_text(msg)
        text = text.strip()
        if role in {"system", "developer"} or not text:
            continue
        if text.startswith("Start the live browser call now"):
            continue
        mapped = "agent" if role in {"assistant", "model"} else "user"
        turns.append((mapped, text))
    return turns


async def flush_context_transcript(call_id: str, context_or_messages: Any) -> None:
    transcript = TranscriptBuffer(call_id=call_id)
    try:
        for role, text in context_transcript_turns(context_or_messages):
            await transcript.add(role, text)
    finally:
        await transcript.flush()


def _context_message_role_text(msg: Any) -> tuple[str, str]:
    if isinstance(msg, dict):
        role = str(msg.get("role", ""))
        content = msg.get("content")
        if content is not None:
            return role, str(content)
        return role, _parts_text(msg.get("parts"))
    role = str(getattr(msg, "role", ""))
    content = getattr(msg, "content", None)
    if content is not None:
        return role, str(content)
    return role, _parts_text(getattr(msg, "parts", None))


def _parts_text(parts: Any) -> str:
    if not isinstance(parts, list):
        return ""
    chunks: list[str] = []
    for part in parts:
        if isinstance(part, dict):
            chunks.append(str(part.get("text") or ""))
        else:
            chunks.append(str(getattr(part, "text", "") or ""))
    return "".join(chunks)


# ---------------------------------------------------------------------------
# Recording upload
# ---------------------------------------------------------------------------

def _local_recording_path(call_id: str) -> Path:
    return Path(settings.recordings_local_dir) / f"{call_id}.wav"


def _recordings_bucket() -> str:
    return settings.s3_recordings_bucket or os.environ.get("FILE_STORAGE_BUCKET", "")


def _recordings_region() -> str:
    return settings.s3_region or os.environ.get("FILE_STORAGE_REGION", "")


def _recordings_endpoint_url() -> str:
    return settings.s3_endpoint_url or os.environ.get("FILE_STORAGE_ENDPOINT", "")


def _recordings_public_base_url() -> str:
    return settings.s3_recordings_public_base_url or os.environ.get(
        "FILE_STORAGE_PUBLIC_BASE_URL", ""
    )


def _recordings_access_key_id() -> str:
    return settings.aws_access_key_id or os.environ.get("FILE_STORAGE_ACCESS_KEY_ID", "")


def _recordings_secret_access_key() -> str:
    return settings.aws_secret_access_key or os.environ.get(
        "FILE_STORAGE_SECRET_ACCESS_KEY", ""
    )


async def upload_recording(call_id: str) -> str | None:
    """Upload the local FreeSWITCH recording to S3 and update ``audioUrl``.

    Returns the resolved URL (or ``file://`` path if S3 isn't configured),
    or ``None`` if the file doesn't exist. Never raises.
    """
    path = _local_recording_path(call_id)
    if not path.exists():
        log.info("recording.missing", call_id=call_id, path=str(path))
        return None

    url: str | None = None
    if _recordings_bucket():
        try:
            url = await _upload_to_s3(path)
        except Exception as exc:  # noqa: BLE001
            log.warning("recording.s3_upload_failed", error=str(exc), call_id=call_id)

    if url is None:
        # Fallback: expose a local file reference. In prod this will be the S3 URL.
        url = path.resolve().as_uri()

    if ObjectId.is_valid(call_id):
        try:
            db = get_db()
            await db["calls"].update_one(
                {"_id": ObjectId(call_id)},
                {"$set": {"audioUrl": url}},
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("recording.db_update_failed", error=str(exc), call_id=call_id)
    return url


async def _upload_to_s3(path: Path) -> str | None:
    try:
        import boto3  # type: ignore[import-not-found]
    except ImportError:
        log.warning(
            "recording.boto3_missing",
            hint="pip install boto3 or leave S3_RECORDINGS_BUCKET/FILE_STORAGE_BUCKET unset to skip",
        )
        return None

    loop = asyncio.get_running_loop()

    def _do_upload() -> str:
        bucket = _recordings_bucket()
        region = _recordings_region()
        endpoint_url = _recordings_endpoint_url()
        access_key_id = _recordings_access_key_id()
        secret_access_key = _recordings_secret_access_key()
        public_base_url = _recordings_public_base_url().rstrip("/")

        kwargs: dict[str, Any] = {}
        if region:
            kwargs["region_name"] = region
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        if access_key_id:
            kwargs["aws_access_key_id"] = access_key_id
        if secret_access_key:
            kwargs["aws_secret_access_key"] = secret_access_key
        client = boto3.client("s3", **kwargs)
        key = f"recordings/{path.name}"
        extra_args = {"ContentType": "audio/wav"}
        if public_base_url:
            extra_args["ACL"] = "public-read"
        client.upload_file(
            str(path),
            bucket,
            key,
            ExtraArgs=extra_args,
        )
        if public_base_url:
            return f"{public_base_url}/{key}"
        if endpoint_url:
            return f"{endpoint_url.rstrip('/')}/{bucket}/{key}"
        host = f"{bucket}.s3"
        if region:
            host += f".{region}"
        host += ".amazonaws.com"
        return f"https://{host}/{key}"

    return await loop.run_in_executor(None, _do_upload)


# ---------------------------------------------------------------------------
# Summarization
# ---------------------------------------------------------------------------

_SENTIMENT_HINT = (
    "Pick exactly one of: positive, neutral, negative. "
    "Base it on the caller's tone, outcome, and closing sentiments."
)


async def summarize_call(call_id: str) -> dict[str, str] | None:
    """Generate a two-sentence summary + sentiment. Writes both to the Call doc.

    Requires ``GEMINI_API_KEY``. Falls back to a deterministic heuristic when
    the key is missing. Never raises.
    """
    if not settings.summarizer_enabled:
        return None
    if not ObjectId.is_valid(call_id):
        return None
    try:
        db = get_db()
        doc = await db["calls"].find_one({"_id": ObjectId(call_id)})
    except Exception as exc:  # noqa: BLE001
        log.warning("summary.fetch_failed", error=str(exc), call_id=call_id)
        return None
    if not doc:
        return None
    transcript = doc.get("transcript") or []
    if not transcript:
        return None

    corpus = "\n".join(
        f"{t.get('role', '?').upper()}: {t.get('text', '')}" for t in transcript
    )

    summary: str | None = None
    sentiment: str | None = None
    if settings.gemini_api_key:
        try:
            summary, sentiment = await _gemini_summarize(corpus)
        except Exception as exc:  # noqa: BLE001
            log.warning("summary.gemini_failed", error=str(exc), call_id=call_id)

    if not summary:
        summary, sentiment = _heuristic_summary(transcript)

    try:
        await db["calls"].update_one(
            {"_id": ObjectId(call_id)},
            {"$set": {"summary": summary, "sentiment": sentiment}},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("summary.write_failed", error=str(exc), call_id=call_id)

    return {"summary": summary, "sentiment": sentiment or ""}


def _heuristic_summary(turns: list[dict[str, Any]]) -> tuple[str, str]:
    """No-key fallback summary. Uses last few turns to produce a one-liner."""
    last = [t for t in turns[-4:] if t.get("text")]
    if not last:
        return ("Call ended with no transcribed turns.", "neutral")
    joined = " ".join(str(t.get("text", "")).strip() for t in last)
    head = joined[:240] + ("…" if len(joined) > 240 else "")
    return (f"{len(turns)}-turn call. Tail: {head}", "neutral")


async def _gemini_summarize(corpus: str) -> tuple[str, str]:
    """Call Gemini Flash once for a short summary + sentiment."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={settings.gemini_api_key}"
    )
    prompt = (
        "You are summarizing a phone call between an AI agent and a customer. "
        "Write a two-sentence summary capturing the caller's intent, the outcome, "
        "and any follow-up actions. Then on a new line write 'Sentiment: <word>' "
        f"where <word> is one of positive, neutral, or negative. {_SENTIMENT_HINT}\n\n"
        "Transcript:\n"
        f"{corpus[:6000]}"
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 256},
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        data = r.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError):
        return ("", "neutral")

    sentiment = "neutral"
    summary_lines: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.lower().startswith("sentiment"):
            val = line.split(":", 1)[-1].strip().lower()
            if val in ("positive", "negative", "neutral"):
                sentiment = val
        else:
            summary_lines.append(line)
    summary = " ".join(summary_lines).strip() or text
    return summary, sentiment


# ---------------------------------------------------------------------------
# Call lifecycle hook
# ---------------------------------------------------------------------------

async def finalize_call(call_id: str) -> None:
    """Run after CHANNEL_HANGUP_COMPLETE has been processed.

    Uploads recording, then summarizes. Safe to call concurrently.
    """
    with contextlib.suppress(OSError):
        os.makedirs(settings.recordings_local_dir, exist_ok=True)

    await upload_recording(call_id)
    await summarize_call(call_id)
