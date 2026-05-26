"""Background workers running inside the voice service event loop.

Started/stopped from app.main's lifespan hook, with a per-worker enable flag
on Settings so each can be disabled independently in dev / CI.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

__all__ = ["CampaignDialer", "KbIngestor"]

if TYPE_CHECKING:
    from app.workers.campaign_dialer import CampaignDialer
    from app.workers.kb_ingestion import KbIngestor


def __getattr__(name: str):
    if name == "CampaignDialer":
        from app.workers.campaign_dialer import CampaignDialer

        return CampaignDialer
    if name == "KbIngestor":
        from app.workers.kb_ingestion import KbIngestor

        return KbIngestor
    raise AttributeError(name)
