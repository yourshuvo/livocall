from __future__ import annotations

from typing import Protocol

from fastapi import WebSocket


class TierRunner(Protocol):
    async def run(
        self,
        ws: WebSocket,
        *,
        call_id: str,
        agent_id: str,
        prompt: str = "",
        metadata: dict[str, str] | None = None,
    ) -> None: ...


def resolve_tier(name: str) -> TierRunner:
    """Return the runner for the given tier name. Lazy imports keep cold-start light."""
    if name == "gemini_live":
        from app.tiers.gemini_live import GeminiLiveTier

        return GeminiLiveTier()
    if name == "grok_voice":
        from app.tiers.grok_voice import GrokVoiceTier

        return GrokVoiceTier()
    if name == "pipeline":
        from app.tiers.pipeline import PipelineTier

        return PipelineTier()
    if name == "dtmf":
        from app.tiers.dtmf import DtmfTier

        return DtmfTier()
    raise ValueError(f"unknown tier: {name}")


__all__ = ["TierRunner", "resolve_tier"]
