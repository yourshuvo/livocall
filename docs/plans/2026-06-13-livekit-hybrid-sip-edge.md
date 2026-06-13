# LiveKit Hybrid SIP Edge Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the Pipecat/mod_audio_fork media path with LiveKit rooms and LiveKit Agents while keeping FreeSWITCH as the thin SIP registration edge for Bangladesh IPT providers that require SIP `REGISTER`.

**Architecture:** FreeSWITCH remains provider-facing only: it maintains the registered IPT account, receives provider inbound calls, and proxies outbound calls to the registered gateway. LiveKit becomes the media and agent runtime: LiveKit SIP converts proxied SIP calls into LiveKit rooms, and a LiveKit Agent joins each room for Gemini Live / fallback voice logic. FreeSWITCH no longer parks calls for `mod_audio_fork`, generates TTS WAV playback, or owns AI turn-taking.

**Tech Stack:** FreeSWITCH host-network SIP edge, LiveKit Server, LiveKit SIP service, LiveKit Agents Python SDK, Redis, FastAPI voice service, MongoDB, existing Next.js dashboard, DigitalOcean Spaces/S3 recording storage.

---

## Decision Record

### Why this architecture

The current IPT provider path is a registered SIP account. A BDIX VPS probe verified the provider accepts digest SIP `REGISTER` and FreeSWITCH is currently `REGED`/`UP` as the contact for the account. LiveKit SIP documentation and current `livekit/sip` source support direct SIP trunking through inbound/outbound `INVITE` plus digest authentication, but do not show a SIP `REGISTER` client/registrar mode.

Therefore:

- **Do replace:** Pipecat phone-call runtime, `mod_audio_fork`, WS audio byte plumbing, `uuid_broadcast`/WAV playback, bot echo suppression hacks.
- **Do not replace yet:** provider-facing FreeSWITCH registration, unless the IPT provider enables static/IP-auth direct trunking to LiveKit.
- **Keep FreeSWITCH small:** only SIP registration/proxying, BTRC disclosure/consent where needed, CDR/recording fallback during migration.

### Target call paths

Inbound:

```txt
IPT provider
  -> FreeSWITCH registered contact on BDIX VPS
  -> FreeSWITCH forwards/proxies INVITE to LiveKit SIP
  -> LiveKit SIP creates/joins LiveKit room
  -> LiveKit Agent joins room and speaks with caller
```

Outbound:

```txt
Dashboard / campaign dialer
  -> voice service creates LiveKit room + dispatches agent
  -> LiveKit SIP creates SIP participant toward FreeSWITCH local SIP edge
  -> FreeSWITCH routes INVITE through registered IPT gateway
  -> Callee joins same LiveKit room as SIP participant
```

Direct future mode, only if provider enables static/IP-auth trunking:

```txt
IPT provider
  -> LiveKit SIP directly
  -> LiveKit room
  -> LiveKit Agent
```

### Non-negotiable constraints

- Do not commit SIP passwords, live API keys, or provider account secrets.
- Keep the existing FreeSWITCH path available behind a feature flag until LiveKit phone calls pass real BDIX tests.
- Keep FreeSWITCH on port `5080`; run LiveKit SIP on `5060` for side-by-side testing.
- Keep FreeSWITCH RTP range separate from LiveKit SIP RTP range to avoid collisions.
- Preserve BTRC disclosure/recording consent behavior before production cutover.

---

## Implementation Tasks

### Task 1: Add LiveKit deployment scaffolding

**Objective:** Add self-hosted LiveKit Server + LiveKit SIP config templates that can run side-by-side with the current FreeSWITCH deployment.

**Files:**
- Create: `infra/livekit/docker-compose.yml`
- Create: `infra/livekit/livekit.example.yaml`
- Create: `infra/livekit/sip.example.yaml`
- Modify: `DEPLOYMENT_COOLIFY_FREESWITCH.md`

**Step 1: Create the LiveKit directory**

Run:

```bash
mkdir -p infra/livekit
```

**Step 2: Add `infra/livekit/docker-compose.yml`**

Use host networking on the BDIX VPS so SIP/RTP and WebRTC ports are directly reachable.

```yaml
services:
  livekit-redis:
    image: redis:7-alpine
    container_name: livocall-livekit-redis
    restart: unless-stopped
    network_mode: host
    command: ["redis-server", "--save", "", "--appendonly", "no"]

  livekit-server:
    image: livekit/livekit-server:latest
    container_name: livocall-livekit-server
    restart: unless-stopped
    network_mode: host
    depends_on:
      - livekit-redis
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
    command: ["--config", "/etc/livekit.yaml"]

  livekit-sip:
    image: livekit/sip:latest
    container_name: livocall-livekit-sip
    restart: unless-stopped
    network_mode: host
    depends_on:
      - livekit-server
      - livekit-redis
    volumes:
      - ./sip.yaml:/etc/livekit-sip.yaml:ro
    environment:
      SIP_CONFIG_FILE: /etc/livekit-sip.yaml
```

**Step 3: Add `infra/livekit/livekit.example.yaml`**

```yaml
port: 7880
bind_addresses:
  - "0.0.0.0"

rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true

redis:
  address: 127.0.0.1:6379

keys:
  LIVEKIT_API_KEY: LIVEKIT_API_SECRET

logging:
  level: info
```

**Step 4: Add `infra/livekit/sip.example.yaml`**

```yaml
api_key: LIVEKIT_API_KEY
api_secret: LIVEKIT_API_SECRET
ws_url: ws://127.0.0.1:7880

redis:
  address: 127.0.0.1:6379

sip_port: 5060
rtp_port: 10000-20000
use_external_ip: true

logging:
  level: info
```

**Step 5: Update deployment docs**

Add a short section to `DEPLOYMENT_COOLIFY_FREESWITCH.md` explaining:

- FreeSWITCH remains on `5080` for registered IPT accounts.
- LiveKit SIP runs on `5060` for proxied SIP into LiveKit rooms.
- LiveKit SIP RTP uses `10000-20000` UDP.
- FreeSWITCH RTP must remain on a different range.
- Production files must be copied from examples and populated with real secrets outside git.

**Step 6: Verify**

Run:

```bash
git diff -- infra/livekit DEPLOYMENT_COOLIFY_FREESWITCH.md
```

Expected: only new LiveKit templates and deployment documentation; no secrets.

**Step 7: Commit**

```bash
git add infra/livekit DEPLOYMENT_COOLIFY_FREESWITCH.md
git commit -m "docs: add LiveKit hybrid SIP deployment scaffold"
```

---

### Task 2: Add LiveKit settings and dependency plan to the voice service

**Objective:** Introduce explicit configuration for LiveKit without changing the existing FreeSWITCH behavior.

**Files:**
- Modify: `services/voice/app/settings.py`
- Modify: `services/voice/pyproject.toml`
- Modify: `services/voice/.env.example`
- Test: `services/voice/tests/test_env_examples.py`

**Step 1: Add settings**

Add these fields to `Settings` in `services/voice/app/settings.py`:

```python
# LiveKit hybrid SIP runtime
livekit_enabled: bool = Field(default=False)
livekit_url: str = Field(default="ws://127.0.0.1:7880")
livekit_api_key: str = Field(default="")
livekit_api_secret: str = Field(default="")
livekit_sip_outbound_trunk_id: str = Field(default="")
livekit_agent_name: str = Field(default="livocall-agent")
livekit_room_prefix: str = Field(default="call")
telephony_media_runtime: str = Field(default="freeswitch_audio_fork")
```

Allowed `telephony_media_runtime` values:

- `freeswitch_audio_fork` — current production path.
- `livekit_hybrid` — FreeSWITCH SIP edge + LiveKit media/agent path.
- `livekit_direct` — future direct provider trunk path, blocked until provider supports static/IP-auth trunking.

**Step 2: Add optional dependencies**

Update `services/voice/pyproject.toml`:

```toml
[project.optional-dependencies]
livekit = [
    "livekit>=1.0.0",
    "livekit-api>=1.0.0",
    "livekit-agents[google]~=1.5",
]
```

Keep the existing `voice` extra until Pipecat is fully removed.

**Step 3: Update env example**

Add only placeholders, no real secrets:

```env
TELEPHONY_MEDIA_RUNTIME=freeswitch_audio_fork
LIVEKIT_ENABLED=false
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=
LIVEKIT_AGENT_NAME=livocall-agent
LIVEKIT_ROOM_PREFIX=call
```

**Step 4: Add/extend env tests**

Extend `services/voice/tests/test_env_examples.py` to assert that the example file includes the LiveKit keys and that no real secret-looking IPT password is committed.

**Step 5: Verify**

Run:

```bash
cd services/voice
uv run pytest tests/test_env_examples.py -q
```

Expected: pass.

**Step 6: Commit**

```bash
git add services/voice/app/settings.py services/voice/pyproject.toml services/voice/.env.example services/voice/tests/test_env_examples.py
git commit -m "feat: add LiveKit hybrid runtime settings"
```

---

### Task 3: Implement LiveKit room/orchestration module

**Objective:** Add a small module for creating deterministic room names, LiveKit access tokens, metadata, and outbound SIP participant requests.

**Files:**
- Create: `services/voice/app/livekit_runtime.py`
- Test: `services/voice/tests/test_livekit_runtime.py`

**Step 1: Write failing tests**

Create tests for:

- deterministic room name format: `call_<call_doc_id>`
- metadata does not contain secrets
- feature flag rejects LiveKit operations when `LIVEKIT_ENABLED=false`
- outbound SIP participant request uses configured trunk ID only, not raw provider password

**Step 2: Implement module skeleton**

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.settings import settings


@dataclass(frozen=True)
class LiveKitCallContext:
    room_name: str
    call_id: str
    agent_id: str
    org_id: str
    direction: str
    tier: str


def room_name_for_call(call_doc_id: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in call_doc_id)
    return f"{settings.livekit_room_prefix}_{safe}"


def call_metadata(ctx: LiveKitCallContext) -> dict[str, str]:
    return {
        "call_id": ctx.call_id,
        "agent_id": ctx.agent_id,
        "org_id": ctx.org_id,
        "direction": ctx.direction,
        "tier": ctx.tier,
    }


def ensure_livekit_enabled() -> None:
    if not settings.livekit_enabled:
        raise RuntimeError("LiveKit runtime is disabled")
```

Add API/client calls in a later task once the package is installed in CI.

**Step 3: Verify**

Run:

```bash
cd services/voice
uv run pytest tests/test_livekit_runtime.py -q
```

Expected: pass.

**Step 4: Commit**

```bash
git add services/voice/app/livekit_runtime.py services/voice/tests/test_livekit_runtime.py
git commit -m "feat: add LiveKit call runtime helpers"
```

---

### Task 4: Add LiveKit Agent worker entrypoint

**Objective:** Create a standalone LiveKit Agent process that joins dispatched rooms and runs the selected LivoCall agent behavior.

**Files:**
- Create: `services/voice/app/livekit_agent_worker.py`
- Modify: `services/voice/Dockerfile`
- Modify: `services/voice/pyproject.toml`
- Test: `services/voice/tests/test_livekit_agent_worker.py`

**Step 1: Define worker responsibilities**

The worker must:

- connect to LiveKit using `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`
- receive room/job metadata with `call_id`, `agent_id`, `org_id`, `tier`
- load the Agent document from MongoDB
- use current runtime provider/model selection rules from `services/voice/app/agent_runtime.py`
- run Gemini Live as the first LiveKit-backed tier
- report call lifecycle events back to the web app using existing `post_voice_event`

**Step 2: Add placeholder tests first**

Tests should validate metadata parsing and provider/model selection without making network calls.

**Step 3: Implement the worker**

Start with a minimal worker that logs and exits in test mode, then wire real LiveKit Agents in a later task.

**Step 4: Verify**

Run:

```bash
cd services/voice
uv run pytest tests/test_livekit_agent_worker.py tests/test_agent_runtime.py -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add services/voice/app/livekit_agent_worker.py services/voice/Dockerfile services/voice/pyproject.toml services/voice/tests/test_livekit_agent_worker.py
git commit -m "feat: add LiveKit agent worker entrypoint"
```

---

### Task 5: Replace outbound call media path behind a feature flag

**Objective:** Let `POST /calls/originate` choose LiveKit hybrid media when enabled, while preserving the existing FreeSWITCH `mod_audio_fork` path as fallback.

**Files:**
- Modify: `services/voice/app/originator.py`
- Modify: `services/voice/app/main.py`
- Test: `services/voice/tests/test_originator.py`
- Test: `services/voice/tests/test_main.py`

**Step 1: Write failing tests**

Add tests for:

- default runtime uses existing `freeswitch_audio_fork`
- `TELEPHONY_MEDIA_RUNTIME=livekit_hybrid` creates a LiveKit room before dialing
- no `livocall_ws_url` is generated in LiveKit hybrid mode
- call doc records `mediaRuntime: "livekit_hybrid"`
- fallback to old path if LiveKit room creation fails before any external SIP call is placed

**Step 2: Update originator flow**

For outbound in `livekit_hybrid` mode:

1. Create `Call` document as today.
2. Create LiveKit room name from call doc ID.
3. Dispatch/start LiveKit Agent for the room.
4. Create a LiveKit SIP participant using an outbound trunk pointed at the local FreeSWITCH SIP edge.
5. FreeSWITCH receives the INVITE from LiveKit and routes it to the registered provider gateway.

**Step 3: Keep old path intact**

Do not delete:

- `audio_fork_args`
- `_build_ws_url`
- existing `bgapi originate ... &park()` flow

Mark them as legacy until production LiveKit calls are verified.

**Step 4: Verify**

Run:

```bash
cd services/voice
uv run pytest tests/test_originator.py tests/test_main.py -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add services/voice/app/originator.py services/voice/app/main.py services/voice/tests/test_originator.py services/voice/tests/test_main.py
git commit -m "feat: route outbound calls through LiveKit hybrid runtime"
```

---

### Task 6: Add FreeSWITCH proxy dialplan for LiveKit SIP

**Objective:** Convert FreeSWITCH from AI media host to SIP proxy/B2BUA for LiveKit calls.

**Files:**
- Create: `infra/freeswitch/dialplan/public/10_livekit_inbound_proxy.xml`
- Create: `infra/freeswitch/dialplan/default/10_livekit_outbound_proxy.xml`
- Modify: `infra/freeswitch/acl.conf.xml`
- Modify: `infra/freeswitch/README.md`

**Step 1: Inbound provider -> LiveKit SIP**

Add a public dialplan path that is enabled only when a channel variable or configured flag says `livekit_hybrid`.

Desired behavior:

```txt
provider INVITE -> FreeSWITCH public context -> bridge to LiveKit SIP on 127.0.0.1:5060
```

The bridge must include headers/variables needed by LiveKit dispatch rules:

- original called number
- caller ID
- org/agent routing key if available from `/calls/inbound-route`
- no SIP password

**Step 2: Outbound LiveKit SIP -> provider gateway**

Add a default/public route for calls arriving from LiveKit SIP to FreeSWITCH. It should validate the destination and route through the selected registered provider gateway:

```xml
<action application="bridge" data="sofia/gateway/${livocall_provider}/${destination_number}"/>
```

**Step 3: ACL**

Allow LiveKit SIP traffic only from loopback/host-local source or the expected container bridge subnet. Do not open FreeSWITCH as an unauthenticated public relay.

**Step 4: Verify config syntax manually on staging VPS**

Run on the VPS:

```bash
fs_cli -x 'reloadxml'
fs_cli -x 'sofia profile external rescan reloadxml'
fs_cli -x 'sofia status gateway sip_j'
```

Expected:

```txt
State REGED
Status UP
```

**Step 5: Commit**

```bash
git add infra/freeswitch/dialplan infra/freeswitch/acl.conf.xml infra/freeswitch/README.md
git commit -m "feat: add FreeSWITCH LiveKit SIP proxy routes"
```

---

### Task 7: Add LiveKit SIP trunk and dispatch provisioning scripts

**Objective:** Provide repeatable scripts to create LiveKit inbound/outbound trunks and dispatch rules for the hybrid FreeSWITCH edge.

**Files:**
- Create: `scripts/livekit/create-hybrid-sip-trunks.ts` or `scripts/livekit/create_hybrid_sip_trunks.py`
- Create: `scripts/livekit/README.md`
- Modify: `package.json` or `services/voice/pyproject.toml` depending on chosen language

**Step 1: Script inputs**

Read from environment:

```env
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_FREE_SWITCH_HOST=127.0.0.1
LIVEKIT_FREE_SWITCH_PORT=5080
LIVEKIT_ALLOWED_SIP_SOURCE_CIDRS=127.0.0.1/32
```

**Step 2: Inbound trunk**

Create a LiveKit inbound trunk that accepts only FreeSWITCH-originated SIP traffic.

**Step 3: Dispatch rule**

Create a dispatch rule that maps inbound SIP calls into deterministic rooms and dispatches `livocall-agent`.

**Step 4: Outbound trunk**

Create a LiveKit outbound trunk whose address is the local FreeSWITCH SIP edge, not the external IPT provider.

**Step 5: Verify**

Run on staging:

```bash
scripts/livekit/create-hybrid-sip-trunks --dry-run
scripts/livekit/create-hybrid-sip-trunks
```

Expected: script prints trunk IDs and dispatch rule IDs; no SIP provider password appears in output.

**Step 6: Commit**

```bash
git add scripts/livekit package.json services/voice/pyproject.toml
git commit -m "chore: add LiveKit SIP provisioning script"
```

---

### Task 8: Move recording and post-call persistence to LiveKit-compatible flow

**Objective:** Ensure call recordings, transcripts, summaries, billing, and callbacks work after media moves out of `mod_audio_fork`.

**Files:**
- Modify: `services/voice/app/persistence.py`
- Modify: `services/voice/app/event_bridge.py`
- Create/modify: `services/voice/app/livekit_events.py`
- Test: `services/voice/tests/test_persistence.py`
- Test: `services/voice/tests/test_recording_contracts.py`

**Step 1: Define event mapping**

Map LiveKit events to existing call lifecycle semantics:

- room started -> call started
- SIP participant joined -> answered
- SIP participant left -> hangup
- room ended -> finalize call
- egress complete -> recording URL available

**Step 2: Recording strategy**

Use LiveKit Egress for production recordings. Preserve local FreeSWITCH recording as a fallback until LiveKit egress is verified.

**Step 3: Update persistence**

Persist `mediaRuntime`, `livekitRoomName`, `livekitSipParticipantId`, `egressId`, and final recording URL.

**Step 4: Verify**

Run:

```bash
cd services/voice
uv run pytest tests/test_persistence.py tests/test_recording_contracts.py -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add services/voice/app/persistence.py services/voice/app/event_bridge.py services/voice/app/livekit_events.py services/voice/tests/test_persistence.py services/voice/tests/test_recording_contracts.py
git commit -m "feat: add LiveKit call event persistence"
```

---

### Task 9: Staging verification on BDIX VPS

**Objective:** Prove real phone audio works before production cutover.

**Files:**
- Modify: `docs/voice-latency-bangladesh.md`
- Modify: `DEPLOYMENT_COOLIFY_FREESWITCH.md`

**Step 1: Deploy side-by-side**

On the BDIX VPS:

```bash
cd /opt/livocall/livekit
cp livekit.example.yaml livekit.yaml
cp sip.example.yaml sip.yaml
# fill secrets in livekit.yaml and sip.yaml outside git
docker compose up -d
```

**Step 2: Health checks**

Run:

```bash
curl http://127.0.0.1:7880
ss -lntup | egrep ':(5060|5080|7880|7881|7882)\b'
```

Expected:

- FreeSWITCH still owns `5080`.
- LiveKit SIP owns `5060`.
- LiveKit server owns `7880/7881/7882`.

**Step 3: SIP gateway check**

Run:

```bash
fs_cli -x 'sofia status gateway sip_j'
```

Expected:

```txt
State   REGED
Status  UP
```

**Step 4: Test calls**

Test in order:

1. Browser/WebRTC LiveKit room with agent, no phone.
2. LiveKit SIP outbound to FreeSWITCH local edge, FreeSWITCH to IPT provider.
3. Provider inbound to FreeSWITCH, FreeSWITCH to LiveKit SIP.
4. Barge-in/interruption.
5. DTMF.
6. Recording + post-call callback.
7. Hangup from caller.
8. Hangup from dashboard.

**Step 5: Latency measurements**

Record:

- SIP answer time
- first agent audio time
- caller speech -> agent response start
- interruption cutoff time
- dropped/no-audio incidents

**Step 6: Commit docs update**

```bash
git add docs/voice-latency-bangladesh.md DEPLOYMENT_COOLIFY_FREESWITCH.md
git commit -m "docs: record LiveKit hybrid staging verification"
```

---

### Task 10: Production cutover and cleanup

**Objective:** Move production phone calls to LiveKit hybrid only after staged verification passes.

**Files:**
- Modify: `services/voice/app/settings.py`
- Modify: `services/voice/app/originator.py`
- Modify: `services/voice/app/main.py`
- Modify: `infra/freeswitch/dialplan/public/00_livocall_inbound.xml`
- Modify: `infra/freeswitch/dialplan/default/00_livocall_outbound.xml`
- Modify: `services/voice/pyproject.toml`

**Step 1: Flip feature flag in production env only**

Set in Coolify, not git:

```env
TELEPHONY_MEDIA_RUNTIME=livekit_hybrid
LIVEKIT_ENABLED=true
```

**Step 2: Keep rollback switch**

Rollback is:

```env
TELEPHONY_MEDIA_RUNTIME=freeswitch_audio_fork
LIVEKIT_ENABLED=false
```

**Step 3: Remove Pipecat only after stability window**

After 7 days of stable LiveKit hybrid production calls:

- remove `mod_audio_fork` start path
- remove legacy Pipecat phone-call runtime from the default image
- keep test fixtures for historical call records
- update README/deployment docs

**Step 4: Verify**

Run:

```bash
cd services/voice
uv run pytest -q
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add services/voice infra/freeswitch DEPLOYMENT_COOLIFY_FREESWITCH.md
git commit -m "feat: cut over phone media to LiveKit hybrid runtime"
```

---

## Acceptance Criteria

- LiveKit Server and LiveKit SIP run side-by-side with FreeSWITCH on the BDIX VPS.
- FreeSWITCH gateway remains `REGED`/`UP` with the IPT provider.
- Outbound test call reaches a Bangladesh number through FreeSWITCH, with caller audio and agent audio both carried by LiveKit.
- Inbound provider call enters a LiveKit room and is answered by the correct agent.
- No call path uses `mod_audio_fork` in LiveKit hybrid mode.
- No SIP password or provider credential is committed to git.
- Existing FreeSWITCH audio-fork path can be restored by flipping environment variables.
- Recording, billing, transcripts/summaries, DTMF, hangup, and dashboard status updates work in LiveKit hybrid mode.

## Open Questions

- Will the IPT provider enable a static/IP-auth SIP trunk later? If yes, add `livekit_direct` mode and remove FreeSWITCH entirely.
- Should LiveKit Egress be self-hosted immediately, or should FreeSWITCH recording remain the temporary recording source during the first hybrid rollout?
- Should the LiveKit Agent run inside the current `services/voice` Coolify app or as a separate worker deployment for scaling and isolation?
- Should SIP traffic between LiveKit SIP and FreeSWITCH stay on loopback/host networking only, or move to a private Docker network after the first staging test?

## Rollback Plan

1. Set `TELEPHONY_MEDIA_RUNTIME=freeswitch_audio_fork` and `LIVEKIT_ENABLED=false` in the voice service environment.
2. Restart the voice service.
3. Leave LiveKit containers running but unused, or stop them with `docker compose down` under `infra/livekit`.
4. Verify `fs_cli -x 'sofia status gateway sip_j'` still shows `REGED`/`UP`.
5. Place one outbound and one inbound legacy call to confirm the old path still works.

## Security Notes

- Store IPT password only in the dashboard secret vault / production env, never in `infra/livekit` examples or docs.
- Restrict FreeSWITCH local relay routes so it cannot become an open SIP relay.
- Restrict LiveKit inbound trunks to FreeSWITCH source IP/CIDR in hybrid mode.
- Rotate LiveKit API secrets before production cutover if they were used in local testing.
- Keep SIP traces redacted before sharing logs.
