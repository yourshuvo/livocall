from __future__ import annotations

from app.esl import EslClient, EslConfig
from app.settings import settings
from app.telephony.edge import OriginateParams, SupervisorParams, TelephonyEdge


class FreeSwitchEdge(TelephonyEdge):
    name = "freeswitch"

    def __init__(self, config: EslConfig | None = None) -> None:
        self.config = config or EslConfig(
            host=settings.fs_host,
            port=settings.fs_esl_port,
            password=settings.fs_esl_password,
        )

    def _client(self) -> EslClient:
        return EslClient(self.config)

    async def originate(self, params: OriginateParams) -> str:
        client = self._client()
        try:
            await client.connect()
            return await client.originate(
                gateway=params.gateway,
                to_e164=params.to_e164,
                agent_id=params.agent_id,
                tier=params.tier,
                from_e164=params.from_e164,
                ws_url=params.ws_url,
                call_doc_id=params.call_doc_id,
                channel_uuid=params.channel_uuid,
                disclosure_url=params.disclosure_url,
                record_mode=params.record_mode,
                consent_prompt_url=params.consent_prompt_url,
            )
        finally:
            await client.close()

    async def hangup(self, uuid: str, cause: str = "NORMAL_CLEARING") -> str:
        client = self._client()
        try:
            await client.connect()
            return await client.hangup(uuid, cause)
        finally:
            await client.close()

    async def transfer(self, uuid: str, target: str) -> str:
        client = self._client()
        try:
            await client.connect()
            return await client.transfer(uuid, target)
        finally:
            await client.close()

    async def playback(self, uuid: str, url: str) -> str:
        client = self._client()
        try:
            await client.connect()
            return await client.playback(uuid, url)
        finally:
            await client.close()

    async def eavesdrop(self, params: SupervisorParams) -> str:
        client = self._client()
        try:
            await client.connect()
            return await client.eavesdrop(
                gateway=params.gateway,
                target_e164=params.target_e164,
                from_e164=params.from_e164,
                source_uuid=params.source_uuid,
                supervisor_uuid=params.supervisor_uuid,
                action=params.action,
            )
        finally:
            await client.close()
