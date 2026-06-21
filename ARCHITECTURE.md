# LivoCall Architecture

LivoCall is a self-serve AI phone-call platform for Bangladeshi businesses.
The current telephony edge is embedded PJSIP/pjsua2 inside `services/voice`.

## System Shape

```txt
apps/web
  Next.js dashboard, public REST API, billing, SIP credential management

services/voice
  FastAPI control API, PJSIP SIP/RTP edge, AI media tiers, workers

mongo / redis
  product data, call state, campaigns, worker coordination
```

## Call Flow

Outbound:

```txt
Dashboard/API -> web -> voice /calls/originate
voice -> PJSIP account -> SIP carrier -> PSTN callee
PJSIP media adapter <-> AI tier <-> provider APIs
voice -> web /api/internal/voice-event
```

Inbound:

```txt
SIP carrier -> voice PJSIP transport
PJSIP account/DID lookup -> mapped live agent
PJSIP media adapter <-> selected AI tier
voice -> web lifecycle/transcript/billing events
```

The web dashboard stores SIP credentials on `PhoneNumber` rows. The voice
service loads active rows when `PJSIP_LOAD_ACCOUNTS_FROM_DB=true`, and web
number create/update/delete calls trigger `POST /pjsip/reload`.

## Media

PJSIP owns SIP signaling and RTP. The media adapter converts carrier audio into
the internal PCM contract used by AI tiers:

- internal phone audio: mono PCM s16le at `SAMPLE_RATE_IN`
- Gemini Live bridge: PCM or PCMU helpers depending on tier
- pipeline tier: Pipecat websocket transport with raw PCM serializer

AI audio is streamed directly back into the PJSIP media bridge. No external PBX,
XML dialplan, or sideband media fork process is required.

## Voice Tiers

| Tier | Runtime |
|---|---|
| `gemini_live` | Gemini Live native audio session |
| `grok_voice` | Grok Voice websocket session |
| `pipeline` | Pipecat STT -> LLM -> TTS pipeline |
| `dtmf` | DTMF menu + optional prompt/playback actions |

## Deployment

Use `DEPLOYMENT_PJSIP.md` and `infra/docker-compose.prod.yml`.

Expose the voice service HTTP port plus the configured SIP/RTP UDP ports:

```txt
8084/tcp
5070/udp
20000-30000/udp
```

Set `PJSIP_PUBLIC_ADDRESS` when the voice container is behind NAT and the SIP
carrier needs the public media/signaling address.

## Security

- Web-to-voice control uses `VOICE_SERVICE_TOKEN`.
- Voice-to-web callbacks use `WEB_SHARED_SECRET` / `VOICE_SHARED_SECRET`.
- SIP credentials are encrypted with `SIP_CREDENTIAL_SECRET`.
- Provider SIP IP allow-lists and host firewalls should restrict SIP/RTP where
  the carrier supports it.
- Browser test media uses `VOICE_WS_SHARED_SECRET` for signed direct sessions.
