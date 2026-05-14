"""Background workers running inside the voice service event loop.

Started/stopped from app.main's lifespan hook, with a per-worker enable flag
on Settings so each can be disabled independently in dev / CI.
"""

from __future__ import annotations

from app.workers.campaign_dialer import CampaignDialer
from app.workers.kb_ingestion import KbIngestor

__all__ = ["CampaignDialer", "KbIngestor"]
