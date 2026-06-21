# LivoCall Deployment: Embedded PJSIP

This guide deploys LivoCall with the voice service owning SIP signaling and RTP
through embedded PJSIP/pjsua2.

## Services

```txt
apps/web        Next.js dashboard, port 3000
services/voice  FastAPI voice engine + PJSIP edge, port 8084
mongo           application database
redis           workers, locks, and queues
```

## Network

Open:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5070/udp
ufw allow 20000:30000/udp
```

Use `PJSIP_LOCAL_SIP_PORT=5070`, or change the firewall and compose port if
your SIP carrier requires a different port. Set `PJSIP_PUBLIC_ADDRESS` when the
voice container is behind NAT.

## Required Environment

Web:

```env
VOICE_SERVICE_URL=https://voice.yourdomain.com
VOICE_SERVICE_TOKEN=shared-random-token
VOICE_SHARED_SECRET=shared-web-voice-secret
SIP_CREDENTIAL_SECRET=shared-sip-encryption-secret
```

Voice:

```env
TELEPHONY_EDGE=pjsip
VOICE_SERVICE_TOKEN=shared-random-token
WEB_SHARED_SECRET=shared-web-voice-secret
SIP_CREDENTIAL_SECRET=shared-sip-encryption-secret
PJSIP_LOAD_ACCOUNTS_FROM_DB=true
PJSIP_DEFAULT_ACCOUNT_SLUG=sip_custom
PJSIP_LOCAL_SIP_PORT=5070
PJSIP_RTP_PORT_START=20000
PJSIP_RTP_PORT_RANGE=10000
PJSIP_CODECS=PCMU/8000,PCMA/8000
```

Add SIP trunks in the dashboard. The voice service reads active `PhoneNumber`
rows from Mongo and reloads them through `POST /pjsip/reload` whenever numbers
are created, updated, or deleted.

## Verify

```bash
curl https://voice.yourdomain.com/health
curl -X POST https://voice.yourdomain.com/pjsip/reload \
  -H "Authorization: Bearer $VOICE_SERVICE_TOKEN"
```

Expected health fields include `telephony_edge: pjsip`, SIP/RTP ports, codec
preferences, and `pjsip_load_accounts_from_db: true`.

## Real Call Checklist

- DNS points `app.yourdomain.com` and `voice.yourdomain.com` to the VPS.
- Web and voice share `VOICE_SERVICE_TOKEN`.
- Web `VOICE_SHARED_SECRET` equals voice `WEB_SHARED_SECRET`.
- Web and voice share `SIP_CREDENTIAL_SECRET`.
- Voice has `VOICE_FAKE_DRIVER=false`.
- SIP/RTP UDP ports are open and provider IP allow-lists include the VPS.
- At least one dashboard number has SIP server, username, password, and
  `outboundEnabled=true`.
- Inbound DIDs have `inboundEnabled=true` and an attached live agent.
- AI provider keys are configured for the selected tier.
