# LivoCall deployment tutorial: Coolify + Voice + FreeSWITCH

This guide deploys this repository on one BDIX VPS.

Recommended topology for a single VPS:

- Coolify manages the public Next.js web dashboard.
- Coolify or Docker manages MongoDB and Redis.
- A small host-network Docker Compose stack runs the voice service and FreeSWITCH.

The reason for this split is SIP/RTP. FreeSWITCH is not a normal web service. It needs host networking, UDP RTP ports, SIP trunk allow-lists, and a reliable localhost-style path to the voice engine.

## 1. DNS

Create DNS records:

```txt
app.yourdomain.com     A     YOUR_VPS_PUBLIC_IP
```

Optional, only if you want to expose the voice health endpoint publicly:

```txt
voice.yourdomain.com   A     YOUR_VPS_PUBLIC_IP
```

Do not expose FreeSWITCH ESL port `8021` publicly.

## 2. VPS firewall

Open web ports:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
```

Open SIP/RTP ports:

```bash
ufw allow 5080/udp
ufw allow 5080/tcp
ufw allow 5060/udp
ufw allow 5060/tcp
ufw allow 16384:32768/udp
```

If the voice service runs on the host and FreeSWITCH connects locally, do not open `8084` publicly. If you need to test it from outside temporarily:

```bash
ufw allow 8084/tcp
```

Keep ESL private:

```bash
ufw deny 8021/tcp
```

## 3. Create secrets

On the VPS:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Use these for:

```txt
VOICE_SERVICE_TOKEN
VOICE_SHARED_SECRET / WEB_SHARED_SECRET
VOICE_WS_SHARED_SECRET
SIP_CREDENTIAL_SECRET
SECRETS_VAULT_KEY
```

Use a strong FreeSWITCH ESL password too:

```bash
openssl rand -base64 32
```

## 4. Deploy MongoDB and Redis

In Coolify, create:

- MongoDB resource
- Redis resource

Copy their internal connection strings.

You need values like:

```env
MONGODB_URI=mongodb://USERNAME:PASSWORD@HOST:27017/livocall?authSource=admin
REDIS_URL=redis://:PASSWORD@HOST:6379/0
```

If you use MongoDB Atlas instead, use the Atlas `mongodb+srv://...` URL.

## 5. Deploy the web app in Coolify

Create a new Coolify Application from your Git repo.

Use:

```txt
Base directory: apps/web
Dockerfile: Dockerfile
Port: 3000
Domain: https://app.yourdomain.com
```

Set web environment variables:

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com

MONGODB_URI=mongodb://...

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_...
CLERK_SECRET_KEY=sk_live_or_test_...

SIP_CREDENTIAL_SECRET=your-random-secret
SECRETS_VAULT_KEY=your-random-secret

VOICE_SERVICE_URL=http://YOUR_VPS_PRIVATE_OR_PUBLIC_IP:8084
VOICE_SERVICE_TOKEN=same-value-as-voice-service-token
VOICE_SHARED_SECRET=same-value-as-voice-web-shared-secret

FREESWITCH_CONFIG_TOKEN=another-random-secret

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

Deploy it, then open:

```txt
https://app.yourdomain.com/status
```

At this point, web may report voice as unavailable until the voice stack is running.

## 6. Copy the repo to the VPS

SSH into the VPS:

```bash
ssh root@YOUR_VPS_PUBLIC_IP
```

Clone the repo:

```bash
mkdir -p /opt/livocall
cd /opt/livocall
git clone YOUR_GIT_REPO_URL repo
cd repo
```

## 7. Create the voice/FreeSWITCH env file

Create:

```bash
nano /opt/livocall/.env
```

Use:

```env
MONGODB_URI=mongodb://...
REDIS_URL=redis://...

WEB_BASE_URL=https://app.yourdomain.com
WEB_SHARED_SECRET=same-value-as-web-VOICE_SHARED_SECRET

VOICE_SERVICE_TOKEN=same-value-as-web-VOICE_SERVICE_TOKEN
VOICE_WS_SHARED_SECRET=your-random-ws-secret
VOICE_WS_PUBLIC_URL=ws://127.0.0.1:8084/ws/audio

FS_HOST=127.0.0.1
FS_ESL_PORT=8021
FS_ESL_PASSWORD=your-freeswitch-esl-password
FS_DEFAULT_GATEWAY=sip_custom

GEMINI_API_KEY=
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
XAI_API_KEY=

ENABLE_CAMPAIGN_DIALER=true
ENABLE_KB_INGESTOR=true
ENABLE_WEBHOOK_SCHEDULER=true
VOICE_FAKE_DRIVER=false
```

For first web-only testing without real calls, you may set:

```env
VOICE_FAKE_DRIVER=true
```

For real SIP calls, set it back to:

```env
VOICE_FAKE_DRIVER=false
```

## 8. Prepare FreeSWITCH config

Create a deployment copy:

```bash
mkdir -p /opt/livocall/freeswitch
cp -R /opt/livocall/repo/infra/freeswitch/* /opt/livocall/freeswitch/
```

### 8.1 Set ESL password

The repo's `event_socket.conf.xml` uses `$${default_password}`. For production, hardcode your ESL password or provide it through FreeSWITCH vars.

Simple approach:

```bash
nano /opt/livocall/freeswitch/event_socket.conf.xml
```

Change:

```xml
<param name="password" value="$${default_password}"/>
```

To:

```xml
<param name="password" value="your-freeswitch-esl-password"/>
```

Keep:

```xml
<param name="listen-ip" value="127.0.0.1"/>
```

That is safe because the voice service will also run with host networking.

### 8.2 Set SIP trunk allow-list

Edit:

```bash
nano /opt/livocall/freeswitch/acl.conf.xml
```

Add the signalling IPs from your BD SIP provider:

```xml
<list name="livocall_trunks" default="deny">
  <node type="allow" cidr="PROVIDER_SIP_IP_1/32"/>
  <node type="allow" cidr="PROVIDER_SIP_IP_2/32"/>
</list>
```

If you do not add provider IPs, inbound SIP will be rejected.

### 8.3 Fix inbound route command

The inbound dialplan calls the Python helper script. Edit:

```bash
nano /opt/livocall/freeswitch/dialplan/public/00_livocall_inbound.xml
```

Find the `system` action and replace the variable-based command with your actual local values:

```xml
<action application="system" data="VOICE_SERVICE_URL=http://127.0.0.1:8084 VOICE_SERVICE_TOKEN=your-voice-service-token destination_number=${destination_number} caller_id_number=${caller_id_number} uuid=${uuid} /usr/local/freeswitch/scripts/inbound_route.py"/>
```

This is important because `${voice_service_url}` and `${voice_service_token}` are not set automatically by this repo.

## 9. Create host-network Docker Compose for voice + FreeSWITCH

Create:

```bash
nano /opt/livocall/voice-freeswitch.compose.yml
```

Paste:

```yaml
services:
  voice:
    build:
      context: /opt/livocall/repo/services/voice
    container_name: livocall-voice
    restart: unless-stopped
    network_mode: host
    env_file:
      - /opt/livocall/.env
    volumes:
      - livocall-recordings:/recordings
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8084"]

  freeswitch:
    image: signalwire/freeswitch:1.10.11-release
    container_name: livocall-freeswitch
    restart: unless-stopped
    network_mode: host
    depends_on:
      - voice
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

Start it:

```bash
cd /opt/livocall
docker compose -f voice-freeswitch.compose.yml up -d --build
```

Check logs:

```bash
docker logs -f livocall-voice
docker logs -f livocall-freeswitch
```

Check voice health:

```bash
curl http://127.0.0.1:8084/health
```

Expected:

```json
{"ok":true,"service":"livocall-engine"}
```

## 10. Verify FreeSWITCH

Open FreeSWITCH CLI:

```bash
docker exec -it livocall-freeswitch fs_cli
```

Inside `fs_cli`:

```txt
status
show modules
sofia status
sofia status profile external
```

Confirm the `external` profile is running on port `5080`.

Confirm `mod_audio_fork` is loaded:

```txt
module_exists mod_audio_fork
```

If it is not loaded, the official FreeSWITCH image may not include it. You must use/build a FreeSWITCH image that includes `mod_audio_fork`, otherwise the AI audio WebSocket bridge cannot work.

## 11. Add or render SIP trunks

There are two ways.

### Option A: Add trunk from dashboard

In the web dashboard:

1. Go to Numbers.
2. Add the DID/number.
3. Add provider slug, username, password, realm/proxy, registration flag, and codecs.
4. Mark inbound/outbound enabled as needed.
5. Attach the number to a live agent for inbound calls.

Then render FreeSWITCH gateway XML from the VPS:

```bash
cd /opt/livocall/repo
python3 infra/freeswitch/scripts/render_trunks.py \
  --template infra/sip-trunks/_template.xml.j2 \
  --url https://app.yourdomain.com/api/numbers/freeswitch \
  --token "your-FREESWITCH_CONFIG_TOKEN" \
  --org-id "YOUR_ORG_ID" \
  --out /opt/livocall/freeswitch/sip_profiles/external
```

Reload FreeSWITCH:

```bash
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile external restart reloadxml"
```

### Option B: Manually create one gateway XML

Create:

```bash
mkdir -p /opt/livocall/freeswitch/sip_profiles/external
nano /opt/livocall/freeswitch/sip_profiles/external/sip_custom.xml
```

Example:

```xml
<include>
  <gateway name="sip_custom">
    <param name="username" value="YOUR_TRUNK_USERNAME"/>
    <param name="auth-username" value="YOUR_TRUNK_USERNAME"/>
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

Reload:

```bash
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile external restart reloadxml"
```

Check registration:

```bash
docker exec -it livocall-freeswitch fs_cli -x "sofia status gateway sip_custom"
```

## 12. Connect web to voice

In Coolify web app env:

```env
VOICE_SERVICE_URL=http://YOUR_VPS_PUBLIC_OR_PRIVATE_IP:8084
VOICE_SERVICE_TOKEN=same-value-as-/opt/livocall/.env
VOICE_SHARED_SECRET=same-value-as-WEB_SHARED_SECRET-in-/opt/livocall/.env
```

If `8084` is not public, the Coolify web container must still be able to reach it through the Docker host IP. Common options:

- `http://172.17.0.1:8084`
- `http://YOUR_VPS_PRIVATE_IP:8084`
- `http://YOUR_VPS_PUBLIC_IP:8084`

Test from inside the web container if needed:

```bash
docker exec -it WEB_CONTAINER_NAME sh
wget -qO- http://172.17.0.1:8084/health
```

Use whichever URL works.

## 13. Smoke tests

Voice health:

```bash
curl http://127.0.0.1:8084/health
```

Web status:

```txt
https://app.yourdomain.com/status
```

FreeSWITCH:

```bash
docker exec -it livocall-freeswitch fs_cli -x "status"
docker exec -it livocall-freeswitch fs_cli -x "sofia status profile external"
docker exec -it livocall-freeswitch fs_cli -x "sofia status gateway sip_custom"
```

Logs during a test call:

```bash
docker logs -f livocall-voice
docker logs -f livocall-freeswitch
```

## 14. Outbound call checklist

Before outbound calls work:

- A SIP gateway exists in FreeSWITCH, for example `sip_custom`.
- The agent exists in MongoDB.
- The phone number row has `outboundEnabled=true`.
- The phone number row has `providerSlug=sip_custom`, or `FS_DEFAULT_GATEWAY=sip_custom`.
- Web has `VOICE_SERVICE_URL` and `VOICE_SERVICE_TOKEN`.
- Voice has `VOICE_FAKE_DRIVER=false`.
- Voice can connect to FreeSWITCH ESL at `127.0.0.1:8021`.
- FreeSWITCH has `mod_audio_fork`.
- AI provider keys are set for the selected tier.

## 15. Inbound call checklist

Before inbound calls work:

- Provider sends SIP INVITE to `YOUR_VPS_PUBLIC_IP:5080`.
- Provider signalling IPs are allow-listed in `acl.conf.xml`.
- FreeSWITCH external profile is running on `5080`.
- The DID is stored as E.164, for example `+8801XXXXXXXXX`.
- The DID has `inboundEnabled=true`.
- The DID is attached to a live agent.
- The inbound dialplan script is mounted at `/usr/local/freeswitch/scripts/inbound_route.py`.
- The inbound XML command contains the correct `VOICE_SERVICE_URL` and `VOICE_SERVICE_TOKEN`.

## 16. Updating deployment

Update repo:

```bash
cd /opt/livocall/repo
git pull
```

Redeploy web in Coolify.

Rebuild voice/FreeSWITCH:

```bash
cd /opt/livocall
docker compose -f voice-freeswitch.compose.yml up -d --build
```

Reload FreeSWITCH XML after trunk/config changes:

```bash
docker exec -it livocall-freeswitch fs_cli -x "reloadxml"
docker exec -it livocall-freeswitch fs_cli -x "sofia profile external restart reloadxml"
```

## 17. Common problems

### Web says voice unavailable

Check:

```bash
curl http://127.0.0.1:8084/health
```

Then check the URL configured in Coolify:

```env
VOICE_SERVICE_URL=http://...
```

### Voice cannot connect to FreeSWITCH

Check:

```bash
docker logs livocall-voice
docker exec -it livocall-freeswitch fs_cli -x "status"
```

Make sure both voice and FreeSWITCH use `network_mode: host`, and:

```env
FS_HOST=127.0.0.1
FS_ESL_PORT=8021
FS_ESL_PASSWORD=correct-password
```

### Inbound calls reject immediately

Check:

- Provider IPs in `acl.conf.xml`
- DID format in MongoDB
- Agent is live
- `/usr/local/freeswitch/scripts/inbound_route.py` exists inside container
- Inbound XML has the real voice token

### Calls connect but no AI audio

Check:

- `mod_audio_fork` is loaded
- `VOICE_WS_PUBLIC_URL=ws://127.0.0.1:8084/ws/audio`
- AI provider key is set for selected tier
- Voice logs show `/ws/audio` or `/ws/audio-pcmu` connection

### SIP registration fails

Check:

```bash
docker exec -it livocall-freeswitch fs_cli -x "sofia status gateway sip_custom"
```

Then verify provider username, password, realm, proxy, register flag, and whether the provider requires IP authentication instead of registration.

## 18. Minimum production checklist

- Domain SSL works in Coolify.
- MongoDB has backups.
- Redis has persistence if campaign/webhook workers matter.
- `8021` is not public.
- SIP provider IPs are allow-listed.
- FreeSWITCH ESL password is changed from default.
- Secrets are not committed to Git.
- Voice and FreeSWITCH restart automatically.
- `mod_audio_fork` is confirmed loaded.
- Test inbound and outbound with one real BD number before opening to users.
