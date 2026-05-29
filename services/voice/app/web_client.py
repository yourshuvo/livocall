"""HTTP client for posting events back to the Next.js web app.

The web app exposes ``POST /api/internal/voice-event`` which authenticates via
``Authorization: Bearer <VOICE_SHARED_SECRET>`` (the same token is set on
both sides).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
import structlog

from app.observability import get_request_id
from app.settings import settings

log = structlog.get_logger()

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10.0)
    return _client


async def post_voice_event(payload: dict[str, Any]) -> bool:
    if not settings.web_shared_secret:
        log.warning("web.shared_secret_missing", hint="set WEB_SHARED_SECRET")
        return False
    url = f"{settings.web_base_url.rstrip('/')}/api/internal/voice-event"
    headers = {"authorization": f"Bearer {settings.web_shared_secret}"}
    rid = get_request_id()
    if rid:
        headers["x-request-id"] = rid
    try:
        r = await _get_client().post(url, json=_json_safe(payload), headers=headers)
        if r.status_code >= 400:
            log.warning("web.event_post_failed", status=r.status_code, body=r.text[:500])
            return False
        return True
    except httpx.HTTPError as exc:
        log.warning("web.event_post_error", error=str(exc))
        return False


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        dt = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, str):
        return value.replace("+00:00", "Z") if value.endswith("+00:00") else value
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


async def aclose() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
    _client = None
