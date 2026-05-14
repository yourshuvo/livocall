# FreeSWITCH config

Drop-in overrides for the official `signalwire/freeswitch:1.10.x` Docker image.

## Layout

- `dialplan/public/00_livocall_inbound.xml` — inbound DID → tier router
- `dialplan/default/00_livocall_outbound.xml` — outbound dial rules per provider, incl. BTRC disclosure playback + recording-consent gating
- `sip_profiles/external.xml` — shared external SIP profile (context `public`, ACL `livocall_trunks`, includes `external/*.xml` for rendered per-trunk gateways)
- `infra/sip-trunks/_template.xml.j2` — Jinja template; one rendered file per provider
- `scripts/render_trunks.py` — renders `infra/sip-trunks/*.yaml` through the Jinja template into `sip_profiles/external/*.xml`
- `event_socket.conf.xml` — ESL bound to localhost
- `acl.conf.xml` — IP allow list seeded with the signalling CIDRs advertised by BD telcos
- `modules.conf.xml` — enables mod_audio_fork, mod_dptools, mod_event_socket

## How a call flows in

1. SIP INVITE from BD trunk → FreeSWITCH `external` profile
2. `00_livocall_inbound.xml` matches DID and looks up `agent_id` + `tier` via API
3. `mod_audio_fork` opens a WebSocket to `ws://voice:8084/ws/audio?call_id=...&agent_id=...&tier=...`
4. Voice service plays back AI audio over the same WS
5. On hangup, FS posts a CDR to `/api/calls/cdr` on the web app

## Outbound

Web app calls `POST /calls/originate` on the voice service, which issues:

```
bgapi originate {agent_id=...,tier=...}sofia/gateway/<provider>/<e164> &socket('127.0.0.1:8084 async full')
```
