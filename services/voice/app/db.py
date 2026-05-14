"""Lazy Mongo client. Uses motor when MONGODB_URI looks valid."""

from __future__ import annotations

from typing import Any

import structlog

from app.settings import settings

log = structlog.get_logger()

_client: Any = None
_db: Any = None


def get_db() -> Any:
    """Return the motor database handle, importing motor lazily."""
    global _client, _db
    if _db is not None:
        return _db
    try:
        from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - dev convenience
        raise RuntimeError(
            "motor is required for Mongo operations; install services/voice deps"
        ) from exc
    _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    # Mongo URI may include a default DB name; otherwise fall back to livocall
    db_name = _client.get_default_database().name if _client.get_default_database() is not None else "livocall"
    _db = _client[db_name]
    log.info("mongo.connected", db=db_name)
    return _db


async def close_db() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client = None
    _db = None
