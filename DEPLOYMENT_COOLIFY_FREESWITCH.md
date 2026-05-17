# LivoCall deployment tutorial: Coolify voice + external FreeSWITCH

This guide deploys this repo on one BDIX VPS with:

- Web dashboard in Coolify.
- Voice engine in Coolify.
- MongoDB and Redis in Coolify, MongoDB Atlas, or another managed service.
- FreeSWITCH outside Coolify, running directly on the same VPS with host networking.

This is the best shape if you want Coolify to manage the app services but still keep SIP/RTP under your control. FreeSWITCH should stay outside normal Coolify app mode because SIP/RTP needs host networking, UDP port ranges, provider IP allow-lists, and predictable network access.

## 0. Important repo notes

The voice engine is in:

```txt
services/voice
```

It runs on port:

```txt
8084
```

The web app is in:

```txt
apps/web
```

It runs on port:

```txt
3000
```

FreeSWITCH config is in:

```txt
infra/freeswitch
```

Known deployment gotchas in the current repo:

- `infra/docker-compose.prod.yml` is not ready for this deployment style. It uses prebuilt `ghcr.io/livocall/...` images and has the wrong voice port mapping for this Dockerfile.
- `infra/freeswitch/event_socket.conf.xml` listens on `127.0.0.1` and uses `loopback.auto`. That works only when voice also runs on the host network. If voice runs in Coolify, you must change ESL bind/ACL.
- `infra/freeswitch/dialplan/public/00_livocall_inbound.xml` uses `${voice_service_url}` and `${voice_service_token}`, but those variables are not automatically set by this repo. Put real values in the dialplan or set FreeSWITCH vars yourself.
- `apps/web/src/app/api/numbers/freeswitch/route.ts` currently returns JSON, not complete FreeSWITCH gateway XML with decrypted passwords. For now, create gateway XML manually unless you implement that endpoint.
- `modules.conf.xml` asks FreeSWITCH to load `mod_audio_fork`. Some public FreeSWITCH images may not include that module. You must verify it after startup.

## 1. DNS

Create DNS records:

```txt
app.yourdomain.com      A      YOUR_VPS_PUBLIC_IP
voice.yourdomain.com    A      YOUR_VPS_PUBLIC_IP
```

Use `app.yourdomain.com` for the Next.js dashboard.

Use `voice.yourdomain.com` for the FastAPI voice engine. This is needed because FreeSWITCH outside Coolify must call the voice engine through a stable URL.

## 2. Firewall

Open web ports:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
```

Open SIP signalling:

```bash
ufw allow 5080/udp
ufw allow 5080/tcp
```

The repo's `external.xml` uses SIP port `5080`. Open `5060` only if your provider specifically sends traffic there or you add another SIP profile:

```bash
ufw allow 5060/udp
ufw allow 5060/tcp
```

Open RTP:

```bash
ufw allow 16384:32768/udp
```

Do not expose ESL publicly:

```bash
ufw deny 8021/tcp
```

If your firewall supports source-specific rules, allow `8021/tcp` only from the local Docker/Coolify network or VPS private IP, never from the public internet.

## 3. Create secrets

On the VPS:

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

Keep these out of Git.

## 4. Deploy MongoDB and Redis

In Coolify, create:

- MongoDB resource
- Redis resource

Copy their connection strings.

Examples:

```env
MONGODB_URI=mongodb://USERNAME:PASSWORD@mongo-host:27017/livocall?authSource=admin
REDIS_URL=redis://:PASSWORD@redis-host:6379/0
```

You may also use MongoDB Atlas:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/livocall
```

Make sure both the web app and voice engine use the same MongoDB database.

## 5. Deploy the web app in Coolify

Create a new Coolify Application from your Git repo.

Use:

```txt
Base directory: apps/web
Build pack: Nixpacks
Port: 3000
Domain: https://app.yourdomain.com
```

This repo includes `apps/web/nixpacks.toml` and `apps/web/.npmrc` for Coolify Nixpacks. They are needed because Coolify's default Nixpacks build runs a plain `npm i`, and npm rejects the current `@clerk/nextjs` / Next.js peer dependency combination unless `legacy-peer-deps` is enabled.

If you deploy with Dockerfile instead of Nixpacks, make sure your Dockerfile install step also uses either pnpm from the workspace lockfile or `npm install --legacy-peer-deps`.

Set environment variables:

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com

MONGODB_URI=mongodb://...

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_...
CLERK_SECRET_KEY=sk_live_or_test_...

SIP_CREDENTIAL_SECRET=your-sip-credential-secret
SECRETS_VAULT_KEY=your-secrets-vault-key

VOICE_SERVICE_URL=https://voice.yourdomain.com
VOICE_SERVICE_TOKEN=your-voice-service-token
VOICE_SHARED_SECRET=your-web-voice-shared-secret

FREESWITCH_CONFIG_TOKEN=your-freeswitch-config-token

FILE_STORAGE_BUCKET=
FILE_STORAGE_REGION=auto
FILE_STORAGE_ENDPOINT=
FILE_STORAGE_ACCESS_KEY_ID=
FILE_STORAGE_SECRET_ACCESS_KEY=
FILE_STORAGE_FORCE_PATH_STYLE=false
FILE_STORAGE_PUBLIC_BASE_URL=

PAYSTATION_MERCHANT_ID=
PAYSTATION_PASSWORD=

GEMINI_API_KEY=
GOOGLE_API_KEY=
```

Deploy, then open:

```txt
https://app.yourdomain.com/status
```

Voice may show unavailable until the next section is complete.

## 6. Deploy the voice engine in Coolify

Create another Coolify Application from the same Git repo.

Use:

```txt
Base directory: services/voice
Build pack: Nixpacks
Port: 8084
Domain: https://voice.yourdomain.com
```

This repo includes `services/voice/nixpacks.toml` for Coolify Nixpacks. It installs the Python package with:

```bash
pip install -e .
```

and starts:

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8084}
```

For the full realtime AI voice pipeline, the Python project defines optional dependencies. If a selected tier complains about missing Pipecat, Google, Deepgram, Cartesia, or storage libraries, change the install command to:

```bash
pip install -e ".[voice,storage]"
```

Enable WebSocket support on the Coolify proxy/domain if Coolify exposes that option.

Set environment variables:

```env
MONGODB_URI=mongodb://...
REDIS_URL=redis://...

WEB_BASE_URL=https://app.yourdomain.com
WEB_SHARED_SECRET=your-web-voice-shared-secret

VOICE_SERVICE_TOKEN=your-voice-service-token
VOICE_WS_SHARED_SECRET=your-voice-ws-shared-secret
VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio

FS_HOST=YOUR_VPS_PUBLIC_OR_PRIVATE_IP
FS_ESL_PORT=8021
FS_ESL_PASSWORD=your-freeswitch-esl-password
FS_DEFAULT_GATEWAY=sip_custom

GEMINI_API_KEY=
GOOGLE_API_KEY=
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
XAI_API_KEY=

ENABLE_CAMPAIGN_DIALER=true
ENABLE_KB_INGESTOR=true
ENABLE_WEBHOOK_SCHEDULER=true
VOICE_FAKE_DRIVER=false
```

For first dashboard-only testing, you can temporarily use:

```env
VOICE_FAKE_DRIVER=true
```

For real calls:

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

### How voice reaches FreeSWITCH ESL

Because voice is inside a Coolify Docker container, `FS_HOST=127.0.0.1` will not work. Use one of:

```env
FS_HOST=YOUR_VPS_PRIVATE_IP
```

or:

```env
FS_HOST=YOUR_VPS_PUBLIC_IP
```

Then lock down port `8021` with firewall and FreeSWITCH ACL.

If your VPS has no private IP, use the public IP but allow `8021` only from Docker/Coolify networks where possible.

## 7. Copy the repo to the VPS for FreeSWITCH config

SSH into the VPS:

```bash
ssh root@YOUR_VPS_PUBLIC_IP
```

Clone the repo:

```bash
mkdir -p /opt/livocall
cd /opt/livocall
git clone YOUR_GIT_REPO_URL repo
```

Copy FreeSWITCH config:

```bash
mkdir -p /opt/livocall/freeswitch
cp -R /opt/livocall/repo/infra/freeswitch/* /opt/livocall/freeswitch/
mkdir -p /opt/livocall/freeswitch/sip_profiles/external
```

## 8. Fix FreeSWITCH ESL for Coolify voice

Edit:

```bash
nano /opt/livocall/freeswitch/event_socket.conf.xml
```

Replace the repo default:

```xml
<param name="listen-ip" value="127.0.0.1"/>
<param name="password" value="$${default_password}"/>
<param name="apply-inbound-acl" value="loopback.auto"/>
```

With:

```xml
<param name="listen-ip" value="0.0.0.0"/>
<param name="listen-port" value="8021"/>
<param name="password" value="your-freeswitch-esl-password"/>
<param name="apply-inbound-acl" value="livocall_esl"/>
```

`0.0.0.0` is acceptable only if you also restrict access using firewall and ACL. Do not leave `8021` open to the internet.

## 9. Add FreeSWITCH ACLs

Edit:

```bash
nano /opt/livocall/freeswitch/acl.conf.xml
```

Use this structure:

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

For `livocall_trunks`, add only the SIP signalling IPs from your BD SIP provider.

For `livocall_esl`, narrow the Docker ranges after you discover Coolify's actual Docker network range:

```bash
docker network inspect $(docker network ls --format '{{.Name}}') | grep -A 3 Subnet
```

## 10. Fix inbound route URL/token

Edit:

```bash
nano /opt/livocall/freeswitch/dialplan/public/00_livocall_inbound.xml
```

Find the `system` action. The repo default uses variables that are not automatically set:

```xml
VOICE_SERVICE_URL=${voice_service_url} VOICE_SERVICE_TOKEN=${voice_service_token}
```

Replace it with your real voice URL and token:

```xml
<action application="system" data="VOICE_SERVICE_URL=https://voice.yourdomain.com VOICE_SERVICE_TOKEN=your-voice-service-token destination_number=${destination_number} caller_id_number=${caller_id_number} uuid=${uuid} /usr/local/freeswitch/scripts/inbound_route.py"/>
```

This script calls:

```txt
POST https://voice.yourdomain.com/calls/inbound-route
```

The voice service returns the signed WebSocket URL used by `audio_fork`.

## 11. Check SIP profile settings

The repo's external SIP profile is:

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

If your provider sends SIP to `5060`, either ask them to send to `5080` or change `sip-port` to `5060` and adjust firewall.

For a public VPS, the profile uses:

```xml
<param name="ext-rtp-ip" value="auto-nat"/>
<param name="ext-sip-ip" value="auto-nat"/>
```

If you have one static public IP and NAT detection causes trouble, replace both with your public IP:

```xml
<param name="ext-rtp-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="ext-sip-ip" value="YOUR_VPS_PUBLIC_IP"/>
```

## 12. Create SIP gateway XML

Because the current dashboard endpoint does not yet output complete gateway XML with decrypted passwords, use manual XML for production.

Create:

```bash
nano /opt/livocall/freeswitch/sip_profiles/external/sip_custom.xml
```

Example for registration-based SIP trunk:

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

Example for IP-authenticated SIP trunk:

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

and/or the phone number's `providerSlug` in MongoDB.

## 13. Run FreeSWITCH outside Coolify

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
      - /opt/livocall/repo/infra/freeswitch/scripts/inbound_route.py:/usr/local/freeswitch/scripts/inbound_route.py:ro
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

Check logs:

```bash
docker logs -f livocall-freeswitch
```

## 14. Verify FreeSWITCH

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

If `mod_audio_fork` is missing, the official image you used does not include it. Build or use a FreeSWITCH image with `mod_audio_fork`.

## 15. Verify voice to FreeSWITCH ESL

In Coolify voice logs, after `VOICE_FAKE_DRIVER=false`, you should not see repeated ESL connection failures.

From the VPS, test that `8021` is listening:

```bash
ss -lntp | grep 8021
```

From inside the voice container, test TCP reachability if you know the container name:

```bash
docker exec -it VOICE_CONTAINER_NAME sh
nc -vz YOUR_VPS_PRIVATE_OR_PUBLIC_IP 8021
```

If this fails:

- Check `event_socket.conf.xml` listens on `0.0.0.0`.
- Check `apply-inbound-acl` points to `livocall_esl`.
- Check `acl.conf.xml` allows the Coolify Docker subnet.
- Check the VPS firewall allows `8021` only from that subnet/private source.
- Check `FS_HOST`, `FS_ESL_PORT`, and `FS_ESL_PASSWORD` in Coolify voice env.

## 16. Verify FreeSWITCH to voice API and WebSocket

From the VPS:

```bash
curl https://voice.yourdomain.com/health
```

Inside the FreeSWITCH container:

```bash
docker exec -it livocall-freeswitch bash
python3 - <<'PY'
import urllib.request
print(urllib.request.urlopen("https://voice.yourdomain.com/health", timeout=5).read().decode())
PY
```

If HTTPS fails inside the container, check DNS, CA certificates, and Coolify proxy.

The voice env must use:

```env
VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio
```

That URL is what FreeSWITCH receives for `mod_audio_fork`.

## 17. Configure dashboard data

In the web dashboard:

1. Create or sign in to an org.
2. Create an agent.
3. Set the agent status to live.
4. Add a phone number/DID.
5. Use E.164 format, for example `+8801XXXXXXXXX`.
6. Set provider slug to `sip_custom`, or match your gateway name.
7. Enable inbound and/or outbound.
8. Attach inbound DID to the live agent.

For outbound fallback, voice uses:

```env
FS_DEFAULT_GATEWAY=sip_custom
```

if no matching phone number gateway is found.

## 18. Smoke tests

Web:

```txt
https://app.yourdomain.com/status
```

Voice:

```bash
curl https://voice.yourdomain.com/health
```

FreeSWITCH:

```bash
docker exec -it livocall-freeswitch fs_cli -x "status"
docker exec -it livocall-freeswitch fs_cli -x "sofia status profile external"
docker exec -it livocall-freeswitch fs_cli -x "sofia status gateway sip_custom"
docker exec -it livocall-freeswitch fs_cli -x "module_exists mod_audio_fork"
```

Watch logs during a call:

```bash
docker logs -f livocall-freeswitch
```

In Coolify, open the voice service logs at the same time.

## 19. Outbound call checklist

Before outbound calls work:

- Web has `VOICE_SERVICE_URL=https://voice.yourdomain.com`.
- Web has the same `VOICE_SERVICE_TOKEN` as voice.
- Voice has `VOICE_FAKE_DRIVER=false`.
- Voice can connect to FreeSWITCH ESL on `FS_HOST:8021`.
- FreeSWITCH `event_socket.conf.xml` is not limited to `127.0.0.1`.
- FreeSWITCH `livocall_esl` ACL allows the Coolify voice container subnet.
- FreeSWITCH has gateway `sip_custom`.
- Agent exists in MongoDB.
- Phone number row has `outboundEnabled=true`.
- Phone number row has `providerSlug=sip_custom`, or voice has `FS_DEFAULT_GATEWAY=sip_custom`.
- Selected AI tier has its API key configured.
- `mod_audio_fork` is loaded.
- `VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio`.

## 20. Inbound call checklist

Before inbound calls work:

- SIP provider sends INVITE to `YOUR_VPS_PUBLIC_IP:5080`.
- Provider signalling IPs are in `livocall_trunks`.
- FreeSWITCH external profile is running on `5080`.
- Inbound dialplan command uses `VOICE_SERVICE_URL=https://voice.yourdomain.com`.
- Inbound dialplan command uses the correct `VOICE_SERVICE_TOKEN`.
- DID is stored as E.164, for example `+8801XXXXXXXXX`.
- DID has `inboundEnabled=true`.
- DID is attached to a live agent.
- `/usr/local/freeswitch/scripts/inbound_route.py` exists inside the FreeSWITCH container.
- FreeSWITCH can reach `https://voice.yourdomain.com/health`.
- Voice returns a `wss://voice.yourdomain.com/ws/audio...` URL.

## 21. Updating deployment

For web and voice:

- Redeploy both apps from Coolify.

For FreeSWITCH config:

```bash
cd /opt/livocall/repo
git pull
cp -R /opt/livocall/repo/infra/freeswitch/* /opt/livocall/freeswitch/
```

Re-apply your production edits:

- ESL password.
- ESL listen IP and ACL.
- SIP provider IP ACL.
- Inbound route URL/token.
- Manual gateway XML.

Restart or reload:

```bash
cd /opt/livocall
docker compose -f freeswitch.compose.yml up -d
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile external restart reloadxml"
```

## 22. Common problems

### Web says voice unavailable

Check:

```bash
curl https://voice.yourdomain.com/health
```

Then verify web env:

```env
VOICE_SERVICE_URL=https://voice.yourdomain.com
VOICE_SERVICE_TOKEN=...
```

### Voice logs show ESL connection errors

The voice app is in Coolify, so this will fail if FreeSWITCH still listens only on `127.0.0.1`.

Fix:

- `event_socket.conf.xml` listen IP `0.0.0.0`.
- `apply-inbound-acl=livocall_esl`.
- `acl.conf.xml` allows Coolify Docker subnet.
- firewall allows `8021` only from local/private Docker subnet.
- Coolify voice env has correct `FS_HOST`.

### Inbound calls reject immediately

Check:

- Provider IPs are in `livocall_trunks`.
- DID format is `+880...` in MongoDB.
- Agent is live.
- Inbound route script is mounted.
- Inbound XML uses real voice URL/token.
- Voice logs show `/calls/inbound-route`.

### Calls connect but no AI audio

Check:

- `module_exists mod_audio_fork`.
- `VOICE_WS_PUBLIC_URL=wss://voice.yourdomain.com/ws/audio`.
- Coolify proxy supports WebSockets for voice domain.
- Voice logs show `/ws/audio` or `/ws/audio-pcmu`.
- AI provider key is configured for selected tier.

### SIP registration fails

Check:

```bash
docker exec -it livocall-freeswitch fs_cli -x "sofia status gateway sip_custom"
```

Verify:

- username
- auth username
- password
- realm
- proxy
- register flag
- transport
- provider IP-auth vs registration mode

### One-way audio

Try setting public IP explicitly in `external.xml`:

```xml
<param name="ext-rtp-ip" value="YOUR_VPS_PUBLIC_IP"/>
<param name="ext-sip-ip" value="YOUR_VPS_PUBLIC_IP"/>
```

Then:

```bash
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile external restart reloadxml"
```

Also confirm RTP UDP range `16384-32768` is open.

## 23. Minimum production checklist

- `app.yourdomain.com` SSL works.
- `voice.yourdomain.com` SSL works.
- Coolify voice app has WebSocket support.
- MongoDB has backups.
- Redis persistence is enabled if campaigns/webhooks matter.
- `8021` is not open to the public internet.
- FreeSWITCH ESL password is changed.
- `livocall_esl` ACL allows only local/private Docker networks.
- SIP provider IPs are allow-listed in `livocall_trunks`.
- `mod_audio_fork` is loaded.
- FreeSWITCH gateway registration is healthy.
- Inbound route script is mounted.
- Inbound route XML has real voice URL/token.
- `VOICE_WS_PUBLIC_URL` uses `wss://voice.yourdomain.com/ws/audio`.
- Test inbound and outbound with one real BD number before opening to users.
