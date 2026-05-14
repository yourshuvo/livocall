"""Auth helpers for the voice service."""

from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.settings import settings


def require_voice_token(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency: enforce ``Authorization: Bearer <VOICE_SERVICE_TOKEN>``.

    If the token is unset (default in dev) the dependency is a no-op so local
    work doesn't require a token.
    """
    expected = settings.voice_service_token
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token"
        )
    if authorization.removeprefix("Bearer ").strip() != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid bearer token"
        )
