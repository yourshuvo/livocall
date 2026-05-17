# FreeSWITCH config

Drop-in overrides for the official `signalwire/freeswitch:1.10.x` Docker image.
For production on one VPS, run FreeSWITCH with host networking and keep the
web/voice app services behind Coolify. See `DEPLOYMENT_COOLIFY_FREESWITCH.md`
and `infra/docker-compose.prod.yml`.

## Layout

- `dialplan/public/00_livocall_inbound.xml` - inbound DID to voice route lookup
- `dialplan/default/00_livocall_outbound.xml` - outbound dial rules per provider, including BTRC disclosure playback and recording-consent gating
- `sip_profiles/external.xml` - shared external SIP profile, context `public`, ACL `livocall_trunks`, includes `external/*.xml` for rendered per-trunk gateways
- `infra/sip-trunks/_template.xml.j2` - Jinja template; one rendered file per provider
- `scripts/render_trunks.py` - renders `infra/sip-trunks/*.yaml` through the Jinja template into `sip_profiles/external/*.xml`
- `scripts/inbound_route.py` - called by FreeSWITCH dialplan to ask voice for the signed `mod_audio_fork` URL
- `event_socket.conf.xml` - ESL bound to localhost by default
- `acl.conf.xml` - IP allow list seeded with the signalling CIDRs advertised by BD telcos
- `modules.conf.xml` - enables `mod_audio_fork`, `mod_dptools`, and `mod_event_socket`

## How a call flows in

1. SIP INVITE from BD trunk reaches the FreeSWITCH `external` profile.
2. `00_livocall_inbound.xml` calls the voice service `/calls/inbound-route` API.
3. Voice looks up the DID, live agent, tier, and call document in MongoDB.
4. FreeSWITCH receives a signed `mod_audio_fork` WebSocket URL built from `VOICE_WS_PUBLIC_URL`.
5. Voice service plays back AI audio over the same WebSocket.
6. Voice posts call events back to the web app with `WEB_SHARED_SECRET`.

## Outbound

Web app calls `POST /calls/originate` on the voice service with
`Authorization: Bearer <VOICE_SERVICE_TOKEN>`. Voice then connects to
FreeSWITCH ESL and originates through the configured gateway:

```txt
bgapi originate {...}sofia/gateway/<provider>/<e164> &park()
```

The voice service also starts `mod_audio_fork` with the signed WebSocket URL
built from `VOICE_WS_PUBLIC_URL`.
