# FreeSWITCH config

Production uses host-network FreeSWITCH outside Coolify, with the web and voice
apps still behind Coolify. The tested image is
`drachtio/drachtio-freeswitch-mrf:0.9.6` because it includes `mod_audio_fork`.
See `DEPLOYMENT_COOLIFY_FREESWITCH.md` for the full VPS flow.

## Layout

- `dialplan/public/00_livocall_inbound.xml` - inbound DID to voice route lookup
- `dialplan/default/00_livocall_outbound.xml` - outbound dial rules per provider, including BTRC disclosure playback and recording-consent gating
- `install-vps.sh` - one-VPS installer that writes config, starts drachtio FreeSWITCH, copies config into the writable container volume, and creates the gateway sync script
- `sip_profiles/external.xml` - reference external SIP profile for images that load `external`; the drachtio image uses `sip_profiles/mrf.xml` with profile name `drachtio_mrf`
- `sip_profiles/external/` - rendered per-trunk gateways synced from dashboard-created SIP trunks
- `infra/sip-trunks/_template.xml.j2` - Jinja template; one rendered file per provider
- `/opt/livocall/sync-freeswitch-gateways.sh` - generated on the VPS by `install-vps.sh`; pulls dashboard gateway XML from `/api/numbers/freeswitch?format=xml`
- `scripts/render_trunks.py` - legacy/local renderer for YAML samples
- `scripts/inbound_route.py` - called by FreeSWITCH dialplan to ask voice for the signed `mod_audio_fork` URL
- `event_socket.conf.xml` - ESL bound to localhost by default
- `acl.conf.xml` - IP allow list seeded with the signalling CIDRs advertised by BD telcos
- `modules.conf.xml` - reference module list; the drachtio image already loads `mod_audio_fork`

## How a call flows in

1. SIP INVITE from BD trunk reaches the FreeSWITCH `drachtio_mrf` profile on port `5080`.
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

## Dashboard Trunk Sync

After users add or update SIP trunks in the dashboard, sync them to FreeSWITCH:

```bash
ENV_FILE=/root/livocall.env /opt/livocall/sync-freeswitch-gateways.sh
```

For production, run that script every minute with cron. It writes
`livocall_dashboard.xml`, copies it into the container, runs `reloadxml`, and
rescans the `drachtio_mrf` profile.

For instant sync, run `scripts/sync_webhook.py` as a systemd service on the VPS
and set these web app env vars:

```env
FREESWITCH_SYNC_WEBHOOK_URL=http://YOUR_VPS_PUBLIC_IP:8789/sync
FREESWITCH_SYNC_WEBHOOK_TOKEN=replace-with-random-token
```

The dashboard and v1 number APIs call that webhook after successful create,
update, and delete operations. Keep the cron sync as a fallback in case the
webhook is temporarily unavailable.
