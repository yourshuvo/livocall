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

The web app is upgraded to Next.js 16 and uses Node 23 in its Dockerfile.

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
node:23-alpine
npm install --legacy-peer-deps --no-audit --no-fund
npm run build
npm start
```

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

The main profile is:

```txt
/opt/livocall/freeswitch/sip_profiles/external.xml
```

Important values:

```xml
<param name="sip-port" value="5080"/>
<param name="context" value="public"/>
<param name="inbound-codec-prefs" value="PCMU@20i"/>
<param name="outbound-codec-prefs" value="PCMU@20i"/>
<param name="apply-inbound-acl" value="livocall_trunks"/>
<param name="auth-calls" value="false"/>
```

If your provider uses `5060`, change `sip-port` or ask them to send to `5080`.

For one static public IP, if NAT detection causes one-way audio, replace:

```xml
<param name="ext-rtp-ip" value="auto-nat"/>
<param name="ext-sip-ip" value="auto-nat"/>
```

with:

```xml
<param name="ext-rtp-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="ext-sip-ip" value="YOUR_VPS_PUBLIC_IP"/>
```

## 14. SIP Gateway XML

The current `/api/numbers/freeswitch` route returns JSON, not complete gateway XML with decrypted passwords. Create gateway XML manually for now.

Create:

```bash
nano /opt/livocall/freeswitch/sip_profiles/external/sip_custom.xml
```

Registration-based trunk:

```xml
<include>
  <gateway name="sip_custom">
    <param name="username" value="YOUR_TRUNK_USERNAME"/>
    <param name="auth-username" value="YOUR_TRUNK_AUTH_USERNAME"/>
    <param name="password" value="YOUR_TRUNK_PASSWORD"/>
    <param name="realm" value="PROVIDER_REALM_OR_DOMAIN"/>
    <param name="proxy" value="PROVIDER_SIP_IP_OR_DOMAIN"/>
    <param name="register-proxy" value="PROVIDER_SIP_IP_OR_DOMAIN"/>
    <param name="register" value="true"/>
    <param name="transport" value="udp"/>
    <param name="caller-id-in-from" value="true"/>
    <param name="codec-prefs" value="PCMU@20i"/>
  </gateway>
</include>
```

IP-authenticated trunk:

```xml
<include>
  <gateway name="sip_custom">
    <param name="username" value="YOUR_DID_OR_ACCOUNT"/>
    <param name="realm" value="PROVIDER_REALM_OR_DOMAIN"/>
    <param name="proxy" value="PROVIDER_SIP_IP_OR_DOMAIN"/>
    <param name="register" value="false"/>
    <param name="transport" value="udp"/>
    <param name="caller-id-in-from" value="true"/>
    <param name="codec-prefs" value="PCMU@20i"/>
  </gateway>
</include>
```

The gateway name must match:

```env
FS_DEFAULT_GATEWAY=sip_custom
```

and/or the phone number `providerSlug` in MongoDB.

## 15. Run FreeSWITCH

Create:

```bash
nano /opt/livocall/freeswitch.compose.yml
```

Paste:

```yaml
services:
  freeswitch:
    image: signalwire/freeswitch:1.10.11-release
    container_name: livocall-freeswitch
    restart: unless-stopped
    network_mode: host
    volumes:
      - /opt/livocall/freeswitch/event_socket.conf.xml:/etc/freeswitch/autoload_configs/event_socket.conf.xml:ro
      - /opt/livocall/freeswitch/modules.conf.xml:/etc/freeswitch/autoload_configs/modules.conf.xml:ro
      - /opt/livocall/freeswitch/acl.conf.xml:/etc/freeswitch/autoload_configs/acl.conf.xml:ro
      - /opt/livocall/freeswitch/dialplan:/etc/freeswitch/dialplan:ro
      - /opt/livocall/freeswitch/sip_profiles/external.xml:/etc/freeswitch/sip_profiles/external.xml:ro
      - /opt/livocall/freeswitch/sip_profiles/external:/etc/freeswitch/sip_profiles/external:ro
      - /opt/livocall/freeswitch/scripts/inbound_route.py:/usr/local/freeswitch/scripts/inbound_route.py:ro
      - livocall-fs-state:/var/lib/freeswitch
      - livocall-recordings:/var/lib/freeswitch/recordings
    environment:
      SOUND_RATES: "8000:16000"
      SOUND_TYPES: "music:en-us-callie"

volumes:
  livocall-fs-state:
  livocall-recordings:
```

Start:

```bash
cd /opt/livocall
docker compose -f freeswitch.compose.yml up -d
```

Logs:

```bash
docker logs -f livocall-freeswitch
```

## 16. Verify FreeSWITCH

Open CLI:

```bash
docker exec -it livocall-freeswitch fs_cli
```

Run:

```txt
status
sofia status
sofia status profile external
sofia status gateway sip_custom
module_exists mod_audio_fork
```

Expected:

- `external` profile is running.
- `sip_custom` exists.
- Gateway is `REGED` if registration is enabled.
- `module_exists mod_audio_fork` returns true.

If `mod_audio_fork` is missing, the image does not include it. Use or build a FreeSWITCH image with `mod_audio_fork`.

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
5. Set provider slug to `sip_custom`, or match your gateway name.
6. Enable inbound and/or outbound.
7. Attach inbound DID to the live agent.

## 19. Outbound Checklist

- Web has `VOICE_SERVICE_URL=https://voice.yourdomain.com`.
- Web and voice share the same `VOICE_SERVICE_TOKEN`.
- Web `VOICE_SHARED_SECRET` equals voice `WEB_SHARED_SECRET`.
- Voice has `VOICE_FAKE_DRIVER=false`.
- Voice can connect to FreeSWITCH ESL at `FS_HOST:8021`.
- FreeSWITCH ESL listens on `0.0.0.0` with `livocall_esl` ACL.
- FreeSWITCH has gateway `sip_custom`.
- `mod_audio_fork` is loaded.
- `VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio`.
- AI provider keys are configured for the tier you use.

## 20. Inbound Checklist

- SIP provider sends INVITE to `YOUR_VPS_PUBLIC_IP:5080`.
- Provider signalling IPs are in `livocall_trunks`.
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
FROM node:23-alpine
```

If it shows `node:20-alpine`, update the Dockerfile in the repo and remove any pasted Dockerfile override in Coolify.

### Web Build Fails at `npm install`

The web Dockerfile must include:

```dockerfile
RUN npm install --legacy-peer-deps --no-audit --no-fund
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

### Calls Connect But No AI Audio

Check:

- `module_exists mod_audio_fork`.
- Coolify voice domain supports WebSockets.
- `VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio`.
- Voice logs show `/ws/audio` or `/ws/audio-pcmu`.
- AI provider key is configured.
- Voice Dockerfile includes `pip install -e ".[voice,storage]"` if you need real Pipecat pipelines.

### One-Way Audio

Set explicit public IP in `external.xml`:

```xml
<param name="ext-rtp-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="ext-sip-ip" value="YOUR_VPS_PUBLIC_IP"/>
```

Reload:

```bash
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile external restart reloadxml"
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
- Gateway XML.

Reload:

```bash
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile external restart reloadxml"
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
- Gateway registration is healthy.
- Inbound route script is mounted.
- `VOICE_WS_PUBLIC_URL` uses `wss://voice.yourdomain.com/ws/audio`.
- Test inbound and outbound with one real BD number before opening to users.
