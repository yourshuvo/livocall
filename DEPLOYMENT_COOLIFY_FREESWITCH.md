# LivoCall deployment: Coolify Dockerfiles + FreeSWITCH

This guide deploys LivoCall on one BDIX VPS with:

- Web dashboard in Coolify using `apps/web/Dockerfile`.
- Voice engine in Coolify using `services/voice/Dockerfile`.
- MongoDB and Redis in Coolify, MongoDB Atlas, or managed services.
- FreeSWITCH outside Coolify on the same VPS with host networking.

FreeSWITCH stays outside Coolify because SIP/RTP needs host networking, UDP port ranges, provider IP allow-lists, and direct control over FreeSWITCH XML.

## 1. Repository Paths

```txt
apps/web              Next.js web dashboard, port 3000
services/voice        FastAPI voice engine, port 8084
infra/freeswitch      FreeSWITCH XML, dialplan, ACL, scripts
apps/web/.env.example Web environment template
services/voice/.env.example Voice environment template
```

The web app is upgraded to Next.js 16 and uses Node 24 in its Dockerfile.

## 2. DNS

Create:

```txt
app.yourdomain.com      A      YOUR_VPS_PUBLIC_IP
voice.yourdomain.com    A      YOUR_VPS_PUBLIC_IP
```

Use:

```txt
https://app.yourdomain.com
https://voice.yourdomain.com
```

## 3. Firewall

Open HTTP/HTTPS:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
```

Open SIP profile port from `infra/freeswitch/sip_profiles/external.xml`:

```bash
ufw allow 5080/udp
ufw allow 5080/tcp
```

Open `5060` only if your SIP provider sends traffic there:

```bash
ufw allow 5060/udp
ufw allow 5060/tcp
```

Open RTP:

```bash
ufw allow 16384:32768/udp
```

Do not expose FreeSWITCH ESL publicly:

```bash
ufw deny 8021/tcp
```

If you can use source-specific firewall rules, allow `8021/tcp` only from your VPS private IP or the Coolify Docker subnet used by the voice container.

## 4. Secrets

Generate secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

Use separate values for:

```txt
VOICE_SERVICE_TOKEN
VOICE_SHARED_SECRET / WEB_SHARED_SECRET
VOICE_WS_SHARED_SECRET
SIP_CREDENTIAL_SECRET
SECRETS_VAULT_KEY
FS_ESL_PASSWORD
FREESWITCH_CONFIG_TOKEN
```

## 5. MongoDB and Redis

Create MongoDB and Redis in Coolify, or use managed services.

Example values:

```env
MONGODB_URI=mongodb://USER:PASSWORD@mongo-host:27017/livocall?authSource=admin
REDIS_URL=redis://:PASSWORD@redis-host:6379/0
```

Use the same `MONGODB_URI` for web and voice.

## 6. Deploy Web in Coolify

Create a Coolify Application from your private repo.

Use:

```txt
Build Pack: Dockerfile
Base directory: apps/web
Dockerfile: Dockerfile
Port: 3000
Domain: https://app.yourdomain.com
```

The web Dockerfile uses:

```txt
node:24-alpine
pnpm install --frozen-lockfile --prod=false --store-dir /pnpm/store
pnpm run build
npm start
```

The runtime stage strips Next.js build-only cache files and copies only production dependencies, `.next`, and `public`, so the final image does not include the full source tree or development dependencies.

Set environment variables from:

```txt
apps/web/.env.example
```

Minimum production web env:

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
APP_BASE_URL=https://app.yourdomain.com
NEXT_PUBLIC_APP_BASE_URL=https://app.yourdomain.com

MONGODB_URI=mongodb://...
REDIS_URL=redis://...

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_...
CLERK_SECRET_KEY=sk_live_or_test_...

SIP_CREDENTIAL_SECRET=...
SECRETS_VAULT_KEY=...

VOICE_SERVICE_URL=https://voice.yourdomain.com
VOICE_SERVICE_TOKEN=same-as-voice-VOICE_SERVICE_TOKEN
VOICE_SHARED_SECRET=same-as-voice-WEB_SHARED_SECRET

FREESWITCH_CONFIG_TOKEN=...
```

After deploy:

```txt
https://app.yourdomain.com/status
```

## 7. Deploy Voice in Coolify

Create a second Coolify Application from the same private repo.

Use:

```txt
Build Pack: Dockerfile
Base directory: services/voice
Dockerfile: Dockerfile
Port: 8084
Domain: https://voice.yourdomain.com
```

The voice Dockerfile uses:

```txt
python:3.11-slim
pip install -e .
uvicorn app.main:app --host 0.0.0.0 --port 8084
```

Set environment variables from:

```txt
services/voice/.env.example
```

Minimum production voice env:

```env
MONGODB_URI=mongodb://...
REDIS_URL=redis://...

WEB_BASE_URL=https://app.yourdomain.com
WEB_SHARED_SECRET=same-as-web-VOICE_SHARED_SECRET

VOICE_SERVICE_TOKEN=same-as-web-VOICE_SERVICE_TOKEN
VOICE_WS_SHARED_SECRET=...
VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio

FS_HOST=YOUR_VPS_PRIVATE_OR_PUBLIC_IP
FS_ESL_PORT=8021
FS_ESL_PASSWORD=...
FS_DEFAULT_GATEWAY=sip_custom

VOICE_FAKE_DRIVER=false

ENABLE_CAMPAIGN_DIALER=true
ENABLE_KB_INGESTOR=true
ENABLE_WEBHOOK_SCHEDULER=true
```

For first dashboard-only testing, set:

```env
VOICE_FAKE_DRIVER=true
```

For real calling, set:

```env
VOICE_FAKE_DRIVER=false
```

Check:

```bash
curl https://voice.yourdomain.com/health
```

Expected:

```json
{"ok":true,"service":"livocall-engine"}
```

### Real AI Pipeline Dependencies

The current voice Dockerfile installs the base service. If you want Gemini Live, Deepgram, Cartesia, and Pipecat pipelines inside the container, change this line in `services/voice/Dockerfile`:

```dockerfile
RUN pip install -e .
```

to:

```dockerfile
RUN pip install -e ".[voice,storage]"
```

Without those extras, the voice routes still run, but some tiers fall back to echo/test behavior when Pipecat provider packages are missing.

## 8. Private Repo Notes

Coolify can deploy private repos through its GitHub/GitLab integration.

For FreeSWITCH config on the VPS, you still need `infra/freeswitch`. Use one of:

```bash
scp -r infra/freeswitch root@YOUR_VPS_IP:/opt/livocall/freeswitch
```

or clone with a deploy key:

```bash
ssh-keygen -t ed25519 -C "livocall-vps" -f ~/.ssh/livocall_deploy
cat ~/.ssh/livocall_deploy.pub
```

Add the public key to your private repo as a deploy key, then:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/livocall_deploy' \
git clone git@github.com:YOUR_USER/YOUR_REPO.git /opt/livocall/repo
```

## 9. Prepare FreeSWITCH Config

On the VPS:

```bash
mkdir -p /opt/livocall/freeswitch
cp -R /opt/livocall/repo/infra/freeswitch/* /opt/livocall/freeswitch/
mkdir -p /opt/livocall/freeswitch/sip_profiles/external
```

If you uploaded by `scp`, make sure this file exists:

```txt
/opt/livocall/freeswitch/scripts/inbound_route.py
```

## 10. FreeSWITCH ESL Config

Edit:

```bash
nano /opt/livocall/freeswitch/event_socket.conf.xml
```

The repo default is localhost-only:

```xml
<param name="listen-ip" value="127.0.0.1"/>
<param name="password" value="$${default_password}"/>
<param name="apply-inbound-acl" value="loopback.auto"/>
```

Because the voice engine runs in Coolify, change it to:

```xml
<param name="listen-ip" value="0.0.0.0"/>
<param name="listen-port" value="8021"/>
<param name="password" value="your-freeswitch-esl-password"/>
<param name="apply-inbound-acl" value="livocall_esl"/>
```

This is safe only if firewall and ACL restrict `8021`.

## 11. FreeSWITCH ACLs

Edit:

```bash
nano /opt/livocall/freeswitch/acl.conf.xml
```

Use:

```xml
<configuration name="acl.conf" description="Network Lists">
  <network-lists>
    <list name="livocall_trunks" default="deny">
      <node type="allow" cidr="PROVIDER_SIP_IP_1/32"/>
      <node type="allow" cidr="PROVIDER_SIP_IP_2/32"/>
    </list>

    <list name="livocall_esl" default="deny">
      <node type="allow" cidr="127.0.0.1/32"/>
      <node type="allow" cidr="YOUR_VPS_PRIVATE_IP/32"/>
      <node type="allow" cidr="172.16.0.0/12"/>
      <node type="allow" cidr="10.0.0.0/8"/>
      <node type="allow" cidr="192.168.0.0/16"/>
    </list>
  </network-lists>
</configuration>
```

Add only your SIP provider signalling IPs to `livocall_trunks`.

Find Coolify Docker subnets:

```bash
docker network inspect $(docker network ls --format '{{.Name}}') | grep -A 3 Subnet
```

Narrow `livocall_esl` after you know the correct subnet.

## 12. Inbound Route Command

Edit:

```bash
nano /opt/livocall/freeswitch/dialplan/public/00_livocall_inbound.xml
```

The repo default uses unset variables:

```xml
VOICE_SERVICE_URL=${voice_service_url} VOICE_SERVICE_TOKEN=${voice_service_token}
```

Replace the `system` action with real values:

```xml
<action application="system" data="VOICE_SERVICE_URL=https://voice.yourdomain.com VOICE_SERVICE_TOKEN=your-voice-service-token destination_number=${destination_number} caller_id_number=${caller_id_number} uuid=${uuid} /usr/local/freeswitch/scripts/inbound_route.py"/>
```

That script calls:

```txt
POST https://voice.yourdomain.com/calls/inbound-route
```

and receives the signed `wss://voice.yourdomain.com/ws/audio...` URL for `mod_audio_fork`.

## 13. SIP Profile

The working VPS setup uses the drachtio FreeSWITCH image because it includes
`mod_audio_fork`. Its active SIP profile is named:

```txt
drachtio_mrf
```

and is stored inside the container at:

```txt
/usr/local/freeswitch/conf/sip_profiles/mrf.xml
```

Important values for LivoCall:

```xml
<param name="sip-port" value="5080"/>
<param name="context" value="public"/>
<param name="rtp-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="sip-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="ext-rtp-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="ext-sip-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="apply-inbound-acl" value="livocall_trunks"/>
<param name="auth-calls" value="false"/>
```

The `public` context is required so inbound DIDs hit
`dialplan/public/00_livocall_inbound.xml`.

If your provider uses `5060`, change `sip-port` or ask them to send to `5080`.

## 14. Dashboard SIP Gateway Sync

Users add SIP trunks and numbers from the dashboard. The web app stores the SIP
credentials encrypted in MongoDB, then exposes FreeSWITCH gateway XML through:

```bash
curl -fsS \
  -H "Authorization: Bearer $FREESWITCH_CONFIG_TOKEN" \
  "https://app.yourdomain.com/api/numbers/freeswitch?format=xml"
```

That endpoint renders one `<gateway>` per active `providerSlug`. The gateway
name must match the phone number `providerSlug`, because outbound calls use:

```txt
sofia/gateway/<providerSlug>/<e164>
```

For a single fallback trunk, keep:

```env
FS_DEFAULT_GATEWAY=sip_custom
```

and make sure the dashboard number/provider slug is `sip_custom`.

On the VPS, sync dashboard trunks into FreeSWITCH with:

```bash
ENV_FILE=/root/livocall.env /opt/livocall/sync-freeswitch-gateways.sh
```

For automatic sync, run it from cron:

```cron
* * * * * /opt/livocall/sync-freeswitch-gateways.sh >> /var/log/livocall-fs-sync.log 2>&1
```

For instant sync when a dashboard/API user creates, updates, or deletes a SIP
number, run the small VPS webhook and set the web app env:

```env
FREESWITCH_SYNC_WEBHOOK_URL=http://YOUR_VPS_PUBLIC_IP:8789/sync
FREESWITCH_SYNC_WEBHOOK_TOKEN=replace-with-random-token
```

The webhook validates the bearer token and runs
`/opt/livocall/sync-freeswitch-gateways.sh`. Keep the cron job as a fallback.

Install the webhook service:

```bash
cp /opt/livocall/repo/infra/freeswitch/scripts/sync_webhook.py /opt/livocall/sync_webhook.py
chmod +x /opt/livocall/sync_webhook.py

cat >/etc/systemd/system/livocall-fs-sync-webhook.service <<'EOF'
[Unit]
Description=LivoCall FreeSWITCH gateway sync webhook
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/root/livocall.env
Environment=FREESWITCH_SYNC_PORT=8789
Environment=FREESWITCH_SYNC_SCRIPT=/opt/livocall/sync-freeswitch-gateways.sh
ExecStart=/usr/bin/python3 /opt/livocall/sync_webhook.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now livocall-fs-sync-webhook
curl http://127.0.0.1:8789/health
```

## 15. Run FreeSWITCH

Use the installer:

```bash
chmod +x /root/install-vps.sh
ENV_FILE=/root/livocall.env /root/install-vps.sh
```

The installer writes `/opt/livocall/freeswitch.compose.yml`, uses
`drachtio/drachtio-freeswitch-mrf:0.9.6`, and creates a writable config volume
because the image entrypoint edits files on startup.

The resulting compose shape is:

```yaml
services:
  freeswitch:
    image: drachtio/drachtio-freeswitch-mrf:0.9.6
    container_name: livocall-freeswitch
    restart: unless-stopped
    network_mode: host
    volumes:
      - livocall-fs-conf:/usr/local/freeswitch/conf
      - /opt/livocall/freeswitch/scripts/inbound_route.py:/usr/local/freeswitch/scripts/inbound_route.py:ro
      - livocall-recordings:/usr/local/freeswitch/recordings
      - livocall-sounds:/usr/local/freeswitch/sounds
      - livocall-logs:/usr/local/freeswitch/log

volumes:
  livocall-fs-conf:
  livocall-recordings:
  livocall-sounds:
  livocall-logs:
```

After startup, copy the LivoCall configs into the writable container config
volume and restart:

```bash
docker cp /opt/livocall/freeswitch/event_socket.conf.xml livocall-freeswitch:/usr/local/freeswitch/conf/autoload_configs/event_socket.conf.xml
docker cp /opt/livocall/freeswitch/acl.conf.xml livocall-freeswitch:/usr/local/freeswitch/conf/autoload_configs/acl.conf.xml
docker cp /opt/livocall/freeswitch/dialplan livocall-freeswitch:/usr/local/freeswitch/conf/
docker cp /opt/livocall/freeswitch/sip_profiles/mrf.xml livocall-freeswitch:/usr/local/freeswitch/conf/sip_profiles/mrf.xml
docker cp /opt/livocall/freeswitch/sip_profiles/external livocall-freeswitch:/usr/local/freeswitch/conf/sip_profiles/
docker restart livocall-freeswitch
```

Logs:

```bash
docker logs -f livocall-freeswitch
```

## 16. Verify FreeSWITCH

Use the ESL password from `FS_ESL_PASSWORD`:

```bash
docker exec -it livocall-freeswitch fs_cli \
  -H 127.0.0.1 \
  -P 8021 \
  -p "$FS_ESL_PASSWORD" \
  -x "status"

docker exec -it livocall-freeswitch fs_cli \
  -H 127.0.0.1 \
  -P 8021 \
  -p "$FS_ESL_PASSWORD" \
  -x "module_exists mod_audio_fork"

docker exec -it livocall-freeswitch fs_cli \
  -H 127.0.0.1 \
  -P 8021 \
  -p "$FS_ESL_PASSWORD" \
  -x "sofia status profile drachtio_mrf"
```

Expected:

- `status` shows FreeSWITCH is ready.
- `module_exists mod_audio_fork` returns `true`.
- `sofia status profile drachtio_mrf` is `RUNNING`.
- `ss -lntp | grep 8021` shows ESL listening.

## 17. Verify App Links

Web:

```bash
curl https://app.yourdomain.com/api/health
```

Voice:

```bash
curl https://voice.yourdomain.com/health
```

FreeSWITCH to voice:

```bash
docker exec -it livocall-freeswitch bash
python3 - <<'PY'
import urllib.request
print(urllib.request.urlopen("https://voice.yourdomain.com/health", timeout=5).read().decode())
PY
```

Voice to FreeSWITCH ESL:

```bash
ss -lntp | grep 8021
```

If you know the Coolify voice container name:

```bash
docker exec -it VOICE_CONTAINER_NAME sh
nc -vz YOUR_VPS_PRIVATE_OR_PUBLIC_IP 8021
```

## 18. Dashboard Data

In the dashboard:

1. Create/sign in to an org.
2. Create an agent.
3. Set agent status to live.
4. Add a DID in E.164 format, for example `+8801XXXXXXXXX`.
5. Set provider slug to `sip_custom`, or match the generated gateway name.
6. Enable inbound and/or outbound.
7. Attach inbound DID to the live agent.
8. Run `/opt/livocall/sync-freeswitch-gateways.sh`, or wait for cron.

## 19. Outbound Checklist

- Web has `VOICE_SERVICE_URL=https://voice.yourdomain.com`.
- Web and voice share the same `VOICE_SERVICE_TOKEN`.
- Web `VOICE_SHARED_SECRET` equals voice `WEB_SHARED_SECRET`.
- Voice has `VOICE_FAKE_DRIVER=false`.
- Voice can connect to FreeSWITCH ESL at `FS_HOST:8021`.
- FreeSWITCH ESL listens on `0.0.0.0` with `livocall_esl` ACL.
- Dashboard-created trunks have been synced to FreeSWITCH.
- FreeSWITCH has the required gateway/provider slug, for example `sip_custom`.
- `drachtio_mrf` profile is running.
- `mod_audio_fork` is loaded.
- `VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio`.
- AI provider keys are configured for the tier you use.

## 20. Inbound Checklist

- SIP provider sends INVITE to `YOUR_VPS_PUBLIC_IP:5080`.
- Provider signalling IPs are in `livocall_trunks`.
- `drachtio_mrf` profile context is `public`.
- DID is stored as E.164, for example `+8801XXXXXXXXX`.
- DID has `inboundEnabled=true`.
- DID is attached to a live agent.
- Inbound XML uses real `VOICE_SERVICE_URL` and `VOICE_SERVICE_TOKEN`.
- `/usr/local/freeswitch/scripts/inbound_route.py` exists inside the FreeSWITCH container.
- FreeSWITCH can reach `https://voice.yourdomain.com/health`.

## 21. Common Problems

### Dockerfile Still Uses Old Node

Coolify may cache an old Dockerfile or UI override. Confirm the final Dockerfile log shows:

```txt
FROM node:24-alpine
```

If it shows `node:20-alpine` or `node:23-alpine`, update the Dockerfile in the repo and remove any pasted Dockerfile override in Coolify.

### Web Build Fails at dependency install

The web Dockerfile must include:

```dockerfile
RUN pnpm install --frozen-lockfile --prod=false --store-dir /pnpm/store
```

### Web Says Voice Unavailable

Check:

```bash
curl https://voice.yourdomain.com/health
```

Then verify:

```env
VOICE_SERVICE_URL=https://voice.yourdomain.com
VOICE_SERVICE_TOKEN=...
```

### Voice Logs Show ESL Connection Errors

Fix:

- `event_socket.conf.xml` listen IP is `0.0.0.0`.
- `apply-inbound-acl=livocall_esl`.
- `acl.conf.xml` allows the Coolify Docker subnet.
- Firewall allows `8021` only from local/private Docker subnet.
- Voice env has correct `FS_HOST`, `FS_ESL_PORT`, `FS_ESL_PASSWORD`.
- Verify with `fs_cli -H 127.0.0.1 -P 8021 -p "$FS_ESL_PASSWORD" -x "status"`.

### Dashboard Trunks Do Not Appear in FreeSWITCH

Check:

- Web has been redeployed with the XML export route.
- `FREESWITCH_CONFIG_TOKEN` in web matches `/root/livocall.env`.
- `curl -H "Authorization: Bearer $FREESWITCH_CONFIG_TOKEN" "https://app.yourdomain.com/api/numbers/freeswitch?format=xml"` returns `<gateway>` XML.
- `/opt/livocall/sync-freeswitch-gateways.sh` runs successfully.
- `sofia profile drachtio_mrf rescan reloadxml` completes.
- `sofia status gateway` lists the provider slug.

### Calls Connect But No AI Audio

Check:

- `module_exists mod_audio_fork`.
- Coolify voice domain supports WebSockets.
- `VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio`.
- Voice logs show `/ws/audio` or `/ws/audio-pcmu`.
- AI provider key is configured.
- Voice Dockerfile includes `pip install -e ".[voice,storage]"` if you need real Pipecat pipelines.

### One-Way Audio

Set explicit public IP in `sip_profiles/mrf.xml` for the `drachtio_mrf` profile:

```xml
<param name="ext-rtp-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="ext-sip-ip" value="YOUR_VPS_PUBLIC_IP"/>
```

Reload:

```bash
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile drachtio_mrf restart reloadxml"
```

Confirm RTP UDP range `16384-32768` is open.

## 22. Update Flow

For web and voice:

```txt
Push to private repo, then redeploy both Coolify Dockerfile apps.
```

For FreeSWITCH config:

```bash
cd /opt/livocall/repo
git pull
cp -R /opt/livocall/repo/infra/freeswitch/* /opt/livocall/freeswitch/
```

Re-apply production edits:

- ESL password.
- ESL listen IP and ACL.
- SIP provider IP ACL.
- Inbound route URL/token.
- `drachtio_mrf` profile context `public`.
- Dashboard gateway sync cron.

Reload:

```bash
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile drachtio_mrf restart reloadxml"
ENV_FILE=/root/livocall.env /opt/livocall/sync-freeswitch-gateways.sh
```

## 23. Production Checklist

- `app.yourdomain.com` SSL works.
- `voice.yourdomain.com` SSL works.
- Web and voice deployed through Dockerfile, not Nixpacks.
- MongoDB backups are enabled.
- Redis persistence is enabled if campaign/webhook workers matter.
- `8021` is not public.
- FreeSWITCH ESL password is changed.
- SIP provider IPs are allow-listed.
- `mod_audio_fork` is loaded.
- `drachtio_mrf` profile is running with context `public`.
- Dashboard gateway sync cron is installed.
- Gateway registration is healthy.
- Inbound route script is mounted.
- `VOICE_WS_PUBLIC_URL` uses `wss://voice.yourdomain.com/ws/audio`.
- Test inbound and outbound with one real BD number before opening to users.
