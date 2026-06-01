"""Knowledge-base ingestion worker.

Polls KnowledgeBase docs whose `sources` array has entries that haven't been
embedded yet (i.e. no matching doc in `kb_chunks` for that ref). For each
pending source it:

  1. Fetches the source content (URL via httpx; text inline; pdf via pypdf if installed)
  2. Splits into ~1k-character chunks with 100-char overlap
  3. Embeds each chunk via Gemini text-embedding-004 (or a hash fallback)
  4. Writes one `kb_chunks` doc per chunk with the vector

The worker is best-effort: if `GEMINI_API_KEY` is missing, it still writes
chunks with a deterministic hash-derived 128-d "embedding" so downstream
similarity search is exercised in dev.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import pathlib
import struct
from datetime import UTC, datetime
from typing import Any

import httpx
import structlog
from bson import ObjectId

from app.db import get_db
from app.leader import LeaderLock
from app.settings import settings

log = structlog.get_logger()


CHUNK_SIZE = 1000
CHUNK_OVERLAP = 100


def _hash_embedding(text: str, dim: int = 128) -> list[float]:
    """Deterministic non-cryptographic embedding for dev / fallback paths.

    We derive `dim` int16 values from successive SHA-512 digests, then map
    each to [-1, 1] and L2-normalise. Avoids NaN/Inf from random float bytes.
    """
    needed = dim * 2  # int16 = 2 bytes
    buf = b""
    seed = text.encode("utf-8")
    while len(buf) < needed:
        seed = hashlib.sha512(seed).digest()
        buf += seed
    ints = struct.unpack(f"{dim}h", buf[:needed])
    floats = [v / 32768.0 for v in ints]
    norm = sum(f * f for f in floats) ** 0.5 or 1.0
    return [f / norm for f in floats]


# expose `struct` to keep the import "used" for static analysers
_ = struct


async def _embed_with_gemini(client: httpx.AsyncClient, text: str) -> list[float]:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent"
        f"?key={settings.gemini_api_key}"
    )
    body = {
        "model": "models/text-embedding-004",
        "content": {"parts": [{"text": text}]},
    }
    r = await client.post(url, json=body, timeout=30.0)
    r.raise_for_status()
    data = r.json()
    values = data.get("embedding", {}).get("values") or []
    if not isinstance(values, list):
        return _hash_embedding(text)
    return [float(v) for v in values]


def _chunk_text(raw: str) -> list[str]:
    text = raw.strip()
    if not text:
        return []
    out: list[str] = []
    i = 0
    while i < len(text):
        out.append(text[i : i + CHUNK_SIZE])
        if i + CHUNK_SIZE >= len(text):
            break
        i += CHUNK_SIZE - CHUNK_OVERLAP
    return out


async def _fetch_source(client: httpx.AsyncClient, source: dict[str, Any]) -> str:
    stype = str(source.get("type") or "")
    ref = str(source.get("ref") or "")
    if stype == "text":
        if ref.startswith("file://"):
            try:
                return pathlib.Path(ref.removeprefix("file://")).read_text(
                    encoding="utf-8",
                    errors="ignore",
                )
            except OSError as exc:
                log.warning("kb.file_failed", ref=ref, error=str(exc))
                return ""
        return ref
    if stype == "url":
        try:
            r = await client.get(ref, timeout=20.0)
            r.raise_for_status()
            ctype = r.headers.get("content-type", "")
            if "text/html" in ctype:
                # Strip tags crudely; real impl would use readability/trafilatura.
                import re

                cleaned = re.sub(r"<[^>]+>", " ", r.text)
                cleaned = re.sub(r"\s+", " ", cleaned).strip()
                return cleaned
            return r.text
        except httpx.HTTPError as exc:
            log.warning("kb.fetch_failed", ref=ref, error=str(exc))
            return ""
    if stype == "pdf":
        try:
            import io

            from pypdf import PdfReader  # type: ignore[import-not-found]

            if ref.startswith("file://"):
                content = pathlib.Path(ref.removeprefix("file://")).read_bytes()
            else:
                r = await client.get(ref, timeout=30.0)
                r.raise_for_status()
                content = r.content
            reader = PdfReader(io.BytesIO(content))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as exc:  # noqa: BLE001
            log.warning("kb.pdf_failed", ref=ref, error=str(exc))
            return ""
    return ""


class KbIngestor:
    def __init__(self, poll_interval_seconds: float = 30.0) -> None:
        self.poll_interval = poll_interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._run(), name="kb-ingestor")
            log.info("kb_ingestor.started", interval_s=self.poll_interval)

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            with contextlib.suppress(asyncio.CancelledError):
                await asyncio.wait_for(self._task, timeout=10.0)
            self._task = None
        log.info("kb_ingestor.stopped")

    async def _run(self) -> None:
        while not self._stop.is_set():
            async with LeaderLock("kb-ingestor", ttl_seconds=60) as lock:
                if not lock.held:
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(
                            self._stop.wait(),
                            timeout=max(10.0, self.poll_interval),
                        )
                    continue
                while lock.held and not self._stop.is_set():
                    try:
                        await self._tick()
                    except Exception:  # noqa: BLE001
                        log.exception("kb_ingestor.tick_error")
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(
                            self._stop.wait(), timeout=self.poll_interval
                        )

    async def _tick(self) -> None:
        db = get_db()
        async with httpx.AsyncClient() as client:
            cursor = db["knowledgebases"].find({})
            async for kb in cursor:
                await self._ingest_kb(client, kb)

    async def _ingest_kb(self, client: httpx.AsyncClient, kb: dict[str, Any]) -> None:
        db = get_db()
        sources = list(kb.get("sources") or [])
        for source in sources:
            ref = str(source.get("ref") or "")
            if not ref:
                continue
            already = await db["kb_chunks"].count_documents(
                {"kbId": kb["_id"], "sourceRef": ref}
            )
            if already > 0:
                continue
            text = await _fetch_source(client, source)
            chunks = _chunk_text(text)
            if not chunks:
                continue
            for idx, chunk in enumerate(chunks):
                if settings.gemini_api_key:
                    try:
                        vec = await _embed_with_gemini(client, chunk)
                    except Exception as exc:  # noqa: BLE001
                        log.warning("kb.embed_failed", error=str(exc))
                        vec = _hash_embedding(chunk)
                else:
                    vec = _hash_embedding(chunk)
                await db["kb_chunks"].insert_one(
                    {
                        "_id": ObjectId(),
                        "orgId": kb.get("orgId"),
                        "kbId": kb["_id"],
                        "sourceRef": ref,
                        "sourceType": source.get("type"),
                        "chunkIndex": idx,
                        "text": chunk,
                        "embedding": vec,
                        "embeddingDim": len(vec),
                    }
                )
            log.info("kb.ingested", kb_id=str(kb["_id"]), ref=ref, chunks=len(chunks))
            await db["agents"].update_many(
                {
                    "$or": [
                        {"knowledgeBaseIds": kb["_id"]},
                        {"knowledgeBaseIds": str(kb["_id"])},
                    ]
                },
                {
                    "$set": {
                        "geminiMemory.status": "stale",
                        "geminiMemory.text": "",
                        "geminiMemory.sourceHash": "",
                        "geminiMemory.updatedAt": datetime.now(UTC),
                    }
                },
            )


_singleton: KbIngestor | None = None


def get_ingestor() -> KbIngestor:
    global _singleton
    if _singleton is None:
        _singleton = KbIngestor(poll_interval_seconds=settings.kb_poll_interval_seconds)
    return _singleton
