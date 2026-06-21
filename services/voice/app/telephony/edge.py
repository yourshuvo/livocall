from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class OriginateParams:
    gateway: str
    to_e164: str
    agent_id: str
    tier: str
    from_e164: str
    call_doc_id: str
    channel_uuid: str
    disclosure_url: str = ""
    record_mode: str = "on"
    consent_prompt_url: str = ""


@dataclass(frozen=True)
class SupervisorParams:
    gateway: str
    target_e164: str
    from_e164: str
    source_uuid: str
    supervisor_uuid: str
    action: str


class TelephonyEdge(ABC):
    """Backend-facing phone-call edge.

    The rest of the voice service deals in LivoCall call IDs and media URLs,
    while the edge owns SIP signaling and media attachment.
    """

    name: str

    async def start(self) -> None:
        """Start long-lived resources if the edge needs them."""
        return None

    async def stop(self) -> None:
        """Stop long-lived resources if the edge needs them."""
        return None

    @abstractmethod
    async def originate(self, params: OriginateParams) -> str:
        """Originate a phone call and return the channel/call UUID."""

    @abstractmethod
    async def hangup(self, uuid: str, cause: str = "NORMAL_CLEARING") -> str:
        """Hang up a live call by edge/channel UUID."""

    @abstractmethod
    async def transfer(self, uuid: str, target: str) -> str:
        """Transfer a live call."""

    @abstractmethod
    async def playback(self, uuid: str, url: str) -> str:
        """Play/broadcast audio into a live call."""

    @abstractmethod
    async def eavesdrop(self, params: SupervisorParams) -> str:
        """Attach a supervisor leg to an existing live call."""
