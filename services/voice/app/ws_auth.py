"""HMAC signing / verification for /ws/audio query-string auth.

The originator signs ``call_id + "|" + expires`` with the shared secret and
appends ``?auth=<expires>.<b64sig>`` to the WebSocket URL. ``verify()``
checks the signature and the expiry before accepting the connection.

When the shared secret is empty, signing emits an empty string and
verification accepts any request — intended for closed-network dev loops
only; production should always set ``VOICE_WS_SHARED_SECRET``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

from app.settings import settings


def _b64(buf: bytes) -> str:
    return base64.urlsafe_b64encode(buf).rstrip(b"=").decode("ascii")


def sign(call_id: str, expires: int | None = None) -> str:
    if not settings.voice_ws_shared_secret:
        return ""
    if expires is None:
        expires = int(time.time()) + settings.voice_ws_auth_ttl_seconds
    payload = f"{call_id}|{expires}".encode()
    mac = hmac.new(
        settings.voice_ws_shared_secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).digest()
    return f"{expires}.{_b64(mac)}"


def verify(call_id: str, token: str | None) -> bool:
    if not settings.voice_ws_shared_secret:
        return True
    if not token or "." not in token:
        return False
    expires_str, _, sig = token.partition(".")
    try:
        expires = int(expires_str)
    except ValueError:
        return False
    if expires < int(time.time()):
        return False
    expected = sign(call_id, expires)
    # constant-time compare on the full token string
    return hmac.compare_digest(expected, token)
