# LivoCall — full-stack delivery notes

This doc accompanies the **cumulative** patch (`backend-frontend.patch`) and tarball (`livocall-full-stack.tar.gz`). It supersedes the earlier backend-only delivery.

## Contents

### Web app (`apps/web`)

**Models** (Mongoose, all org-scoped): `ApiKey`, `Webhook`, `WebhookDelivery`, `LedgerEntry`, `Campaign`, `Contact`, `DncEntry`, **`Connection`** (NEW).

**Shared libs** (`apps/web/src/lib/*`): `errors`, `rate-limit`, `hmac`, `voice-client`, `webhooks`, `billing`, `serialize`, `api-helpers`, `auth/api-key`, `auth/v1`, **`api-fetch`** (NEW — typed client wrapper for browser fetches).

**Dashboard pages** (`/(app)/`):

| Page | Status | What it does |
|------|--------|--------------|
| `/overview` | existing, SSR Mongo | Stat cards + recent calls (no UI changes needed). |
| `/agents`, `/agents/[id]`, `/agents/new` | existing | (no UI changes needed) |
| `/calls`, `/numbers`, `/knowledge`, `/billing`, `/settings` | existing | (no UI changes needed) |
| **`/campaigns`** | NEW | Create / list / start / pause / delete campaigns. |
| **`/dnc`** | NEW | Add / remove DNC entries. Numbers added here are blocked from every outbound originate (dashboard, REST, plugins). |
| **`/connections`** | NEW | Plug LivoCall into WordPress, Shopify, Zapier, Make, n8n, or custom REST. Auto-mints a scoped API key per connection. Shows install instructions inline. |
| **`/developers`** | NEW | In-dashboard API reference + key/webhook management + copy-paste cURL/Node/Python/PHP examples. |

**Sidebar** now shows: Workspace (Overview, Agents, Calls, Numbers, Campaigns, DNC) and Account (Knowledge, Connections, Developers, Billing, Settings).

**Dashboard API routes** (all org-scoped, Zod-validated, paginated):
- `/api/me`
- `/api/agents/[id]/test-call`, `/api/agents/[id]` (PATCH/DELETE)
- `/api/calls`, `/api/calls/[id]` (DELETE = hangup), `/api/calls/originate`
- `/api/knowledge/[id]/sources` (POST/DELETE)
- `/api/billing/usage`, `/api/billing/topup`, `/api/billing/ledger`
- `/api/settings/org`, `/api/settings/api-keys`, `/api/settings/webhooks` (+ children)
- `/api/campaigns` (+ children, including `[id]/start`, `[id]/pause`)
- `/api/contacts`, `/api/dnc`
- **`/api/connections`** (NEW), **`/api/connections/[id]`** (NEW), **`/api/connections/shopify/webhook`** (NEW — receives Shopify webhooks with HMAC verification, originates calls / opts out / syncs customers)
- Internal: `/api/internal/voice-event`, `/api/internal/webhook-tick`

**Public REST v1** (`/api/v1/*`, Bearer-auth, scoped, per-key rate-limited):
- `/api/v1/calls` (GET, POST), `/api/v1/calls/[id]` (GET, DELETE)
- `/api/v1/agents` (GET), `/api/v1/agents/[id]` (GET)
- `/api/v1/dnc` (GET, POST, DELETE)

### Voice service (`services/voice`)

Embedded PJSIP edge, originate/hangup/transfer endpoints, billing computation (minute-rounded per ARCHITECTURE.md §7), and `VOICE_FAKE_DRIVER=true` for end-to-end local testing without SIP. Bearer-auth on all `/calls/*` control endpoints.

### Plugin packages (`plugins/`)

| Plugin | Path | What it does |
|--------|------|--------------|
| **WordPress** | `plugins/livocall-wp/` | WooCommerce-first order-confirmation caller. Per-status triggers (processing / completed / on-hold / cancelled / refunded / failed plus CF7 + manual button), per-trigger agent override + delay, quiet-hours window, retry policy, custom metadata textarea. Manual "Call customer with LivoCall" entry on every order edit page. Signed webhook receiver at `/wp-json/livocall/v1/incoming` fires `livocall_event`. Customisation surface: filters `livocall_should_call_order`, `livocall_resolve_phone_for_order`, `livocall_agent_for_trigger`, `livocall_metadata_for_order`, `livocall_in_quiet_hours`, and actions `livocall_before_call`, `livocall_after_call`. |
| **Shopify** | `plugins/livocall-shopify/` | Two install paths: (a) point Shopify webhooks straight at `/api/connections/shopify/webhook?cid=<id>` — LivoCall verifies HMAC and honours per-topic triggers / per-trigger agent override / quiet-hours from the Connection's `config` JSON; (b) self-host the Node sidecar (`server.js`) for full control with `LIVOCALL_TRIGGERS=` and `LIVOCALL_QUIET_HOURS=` env vars. |

### Docs (`docs/`)

- `docs/API.md` — full REST v1 reference (auth, scopes, errors, rate limits, examples).
- `docs/WEBHOOKS.md` — event catalog, HMAC verification snippets in Node + Python, retry/backoff policy.

## Validation

```bash
cd apps/web
pnpm install
pnpm lint        # 1 pre-existing font warning, no errors
pnpm typecheck   # clean
pnpm test        # 17/17 passing
SESSION_SECRET=ci-only-32-character-fake-session-secret-zzzz pnpm build  # clean

cd ../../services/voice
python -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check .
.venv/bin/mypy app
VOICE_FAKE_DRIVER=true .venv/bin/pytest -q   # 23/23 passing
```

## Wiring

1. `apps/web/.env`:
   ```
   MONGODB_URI=mongodb://...
   SESSION_SECRET=<32+ chars>
   VOICE_SERVICE_URL=http://voice:8084
   VOICE_SERVICE_TOKEN=<shared>
   VOICE_SHARED_SECRET=<shared>
   ```
2. `services/voice/.env`:
   ```
   MONGODB_URI=mongodb://...   # same as web
   WEB_BASE_URL=http://web:3000
   WEB_SHARED_SECRET=<shared>
   VOICE_SERVICE_TOKEN=<shared>
   VOICE_FAKE_DRIVER=true       # for dev without SIP
   ```
3. Schedule `POST /api/internal/webhook-tick` every 30s with the shared secret as the bearer token.

## Phase B (NEW in this delivery)

| Item | What ships |
|------|-----------|
| **Real Pipecat tier pipelines** | `services/voice/app/tiers/{gemini_live,pipeline,dtmf}.py` build full Pipecat graphs when env keys are present. **Tier 1** (Gemini Live multimodal) needs `GEMINI_API_KEY`. **Tier 2** (Deepgram → Gemini Flash → Cartesia) needs `DEEPGRAM_API_KEY` + `GEMINI_API_KEY` + `CARTESIA_API_KEY`. **Tier 3** (DTMF / IVR) does a 5-second capture → Deepgram one-shot → Gemini Flash classifier and replies with `{"intent": "yes\|no\|repeat\|agent\|unknown"}`. All three fall back to a clean echo loop when keys / extras aren't set, so dev/CI keeps working. |
| **PJSIP media bridge + DTMF** | The embedded PJSIP edge owns outbound/inbound SIP, DTMF events, and RTP media. The media bridge hands raw PCM frames to the selected tier and streams AI audio back to the same call. |
| **Outbound campaign dialer** | `services/voice/app/workers/campaign_dialer.py`. Background asyncio task started by `lifespan` when `ENABLE_CAMPAIGN_DIALER=true`. Polls `campaigns{status:'running'}`, respects `concurrency`, schedule windows in `Campaign.schedule.timezone`, retry policy, max attempts, and the per-org DNC list. Tracks attempts in a new `campaign_attempts` collection. |
| **KB embedding ingestion worker** | `services/voice/app/workers/kb_ingestion.py`. Background asyncio task started when `ENABLE_KB_INGESTOR=true`. For each `KnowledgeBase.sources[]` entry that has no `kb_chunks` yet, it fetches (URL via `httpx`; PDF via `pypdf`; inline text), splits into 1k-char chunks with 100-char overlap, embeds via Gemini `text-embedding-004`, and writes one `kb_chunks` doc per chunk. Falls back to deterministic hash embeddings when `GEMINI_API_KEY` is empty. |
| **PayStation live provider** | `apps/web/src/lib/paystation.ts` initiates hosted checkout at `https://api.paystation.com.bd/initiate-payment`. `/api/billing/topup` creates a pending PayStation ledger row and returns the hosted `redirectUrl`. `/api/billing/topup/paystation/callback` verifies the invoice through `/transaction-status` before crediting the ledger atomically. This is the live PayStation environment, so credentials should only be used when real transactions are expected. |

## Applying

The latest cumulative patch against the original Phase A scaffold (commit `c0adf493`) is shipped as **`backend-frontend-phase-b.patch`** alongside the wholesale tree **`livocall-full-stack-with-phase-b.tar.gz`**:

```
git apply backend-frontend-phase-b.patch
```

If you'd rather replace the tree wholesale, unpack `livocall-full-stack-with-phase-b.tar.gz`.
