from __future__ import annotations

import asyncio
from typing import Any


class RuntimeOverrideStore:
    def __init__(self) -> None:
        self._items: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def set(self, call_id: str, value: dict[str, Any]) -> None:
        if not call_id or not value:
            return
        async with self._lock:
            self._items[call_id] = value

    async def pop(self, call_id: str) -> dict[str, Any]:
        async with self._lock:
            return self._items.pop(call_id, {})

    async def peek(self, call_id: str) -> dict[str, Any]:
        async with self._lock:
            return dict(self._items.get(call_id, {}))


runtime_overrides = RuntimeOverrideStore()
