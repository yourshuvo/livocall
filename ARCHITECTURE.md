# LivoCall — Architecture & Build Plan

> A self-serve AI voice-call platform for Bangladeshi businesses. Multi-engine stack (Gemini Live, Grok Voice Agent, Deepgram+Gemini Flash+Cartesia, DTMF+Gemini TTS) over FreeSWITCH on local BD SIP trunks. Editorial light bilingual UI.

## 1. Repository layout

A single monorepo, but cleanly split so the web app, voice engine, and telephony config can deploy independently.

```
livocall/
├── apps/
│   └── web/                  # Next.js 14 (App Router) — dashboard + marketing
├── services/
│   └── voice/                # FastAPI + Pipecat — AI voice engine, ESL bridge
├── infra/
│   ├── freeswitch/           # dialplan, sofia profiles, ACL, codec config
│   ├── docker/               # docker-compose for local dev (web + voice + fs + mongo)
│   └── sip-trunks/           # custom SIP gateway template + render helper
├── packages/
│   └── shared/               # shared TS types (Agent, Call, Tier) consumed by web
├── docs/                     # architecture, runbooks, BD SIP provider notes
├── ARCHITECTURE.md           # this file
└── README.md
```

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Web framework | **Next.js 14 App Router** + TypeScript | RSC for fast dashboards, edge for marketing |
| Styling | **Tailwind CSS** + custom serif/sans pairing (Fraunces + Inter; Hind Siliguri for Bangla) | Editorial feel, no template look |
| UI primitives | Radix UI + hand-rolled components | Avoids the shadcn/AI-slop look while keeping a11y |
| Auth | **Auth.js (NextAuth v5)** with Email magic-link + Google | Works locally, OAuth-ready |
| DB | **MongoDB Atlas** (Mongoose) | Matches your stack pick; flexible schema for agent configs |
| Cache / queue | **Redis** (Upstash for prod) | Call session state, rate limits, BullMQ jobs |
| Voice engine | **Python 3.11 + FastAPI + Pipecat** | Pipecat already has Gemini Live, Deepgram, Cartesia transports |
| Telephony | **FreeSWITCH 1.10** | Industry standard; rich dialplan + mod_audio_fork for AI bridge |
| AI tiers | Gemini Live, Grok Voice Agent, Gemini 2.5 Flash, Gemini TTS, Deepgram Nova-3, Cartesia Sonic | See §4 |
| Telemetry | OpenTelemetry → Grafana Cloud (free tier) | Per-call traces, latency budgets |
| Deploy (web) | **Vercel** | Preview URLs per PR |
| Deploy (voice + FS) | **Hetzner / Contabo VPS in EU + Singapore** + ideally a BD-local VPS for SIP termination | Latency: BD ↔ EU ≈ 250ms, BD ↔ SG ≈ 80ms; SG is the right default |
| IaC | Docker Compose for dev; Terraform module sketch for prod | |

### Why Bangladesh/Singapore (not EU) for the voice node
Round-trip latency to Bangladesh:
- BD-local ≈ 5–30 ms when the SIP carrier peers locally
- SG ≈ 70–90 ms
- Mumbai ≈ 30–50 ms (best, but Indian DCs can have political/peering issues with BD)
- Frankfurt ≈ 230–280 ms (kills conversational feel)
Default to a **BD-local FreeSWITCH + voice node** when the SIP provider can hand off locally. Use Singapore as the first fallback and Mumbai only for carriers with stable private peering. The web app can stay on Vercel global edge because it is not in the media path.

### Conversational latency budget
To keep calls natural, the media path must stay audio-to-audio and avoid chained STT → LLM → TTS where possible:

| Segment | Target |
|---|---:|
| Caller RTP → FreeSWITCH → voice WS | < 60 ms |
| Voice WS → Gemini Live WebSocket | < 120 ms |
| End-of-turn detection | 250–350 ms silence |
| First response audio from Gemini Live | < 700 ms |
| Total perceived turn latency | < 1.0 s |

Operational defaults:
- Realtime tiers use one stateful audio WebSocket with server-side VAD and native barge-in: Gemini Live via `gemini-3.1-flash-live-preview`, or Grok Voice via `grok-voice-think-fast-1.0`.
- Keep the voice service and FreeSWITCH on the same BD host/VPC; do not route audio through Vercel or a remote web server.
- Set `AUDIO_FORK_BUFFER_MS=20` and `AUDIO_FORK_JITTER_BUFFER_MS=20`; increase only if the BD SIP trunk has packet loss/jitter.
- Negotiate SIP as `PCMU@20i` only where the carrier supports it. Gemini still requires raw PCM at the bridge, so allow exactly one µ-law ↔ PCM conversion and avoid Opus/PCMA hops.
- Preconnect Gemini Live during outbound ringing so DNS/TLS/WebSocket/model setup is hidden before the caller answers.
- Keep agent prompts short and set `GEMINI_LIVE_MAX_TOKENS=1024` or lower for phone calls.
- Use Tier 2 only as a fallback: it has at least three network/model hops and will feel slower than Gemini Live.

## 3. Data model (MongoDB)

```ts
Org { _id, name, slug, plan: 'starter'|'growth'|'scale', creditsBdt, createdAt }
User { _id, orgId, email, name, role: 'owner'|'admin'|'agent', locale: 'en'|'bn' }
Agent {
  _id, orgId, name, description,
  tier: 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf',
  language: 'bn-BD' | 'en-US' | 'bn-en-mixed',
  voice: { provider, voiceId, style },
  prompt: { system, firstMessage, guardrails },
  tools: ToolRef[],          // function-calling: lookup_order, transfer_to_human...
  knowledgeBaseIds: ObjectId[],
  postCallWebhook?: string,
  status: 'draft'|'live'
}
PhoneNumber {
  _id, orgId, e164, providerSlug, providerName,
  sipServer, sipPort, sipProxy, sipRealm, sipUsername,
  sipAuthUsername, sipPassword, sipRegister, sipTransport, sipCodecs,
  didRange, agentId, inboundEnabled, outboundEnabled
}
KnowledgeBase { _id, orgId, name, sources: [{type:'url'|'pdf'|'text', ref}], embeddingNamespace }
Call {
  _id, orgId, agentId, direction, fromE164, toE164,
  tier, startedAt, endedAt, durationSec, audioUrl, transcript: Turn[],
  cost: { sttBdt, llmBdt, ttsBdt, sipBdt, totalBdt },
  outcome: 'completed'|'no_answer'|'busy'|'failed'|'voicemail',
  sentiment?, summary?, toolCalls?, dtmfPath?
}
Campaign { _id, orgId, agentId, name, list: ContactRef[], schedule, concurrency, status }
ApiKey { _id, orgId, hashed, scopes, createdAt, lastUsedAt }
Webhook { _id, orgId, url, events, secret }
LedgerEntry { _id, orgId, kind:'topup'|'usage'|'refund', amountBdt, ref, createdAt }
```

All money fields stored as **integer paisa** (BDT × 100) to avoid float drift.

## 4. AI engine tiers

### Tier 1 — Gemini 3.1 Flash Live (`gemini_live`)
- Single bidirectional WebSocket: 16 kHz PCM in, 24 kHz PCM out
- Pipecat `GeminiLiveLLMService` handles VAD, interruption, function calling natively
- Lowest latency (~600 ms turn) and most natural; highest cost
- **Use case**: premium customer support, sales qualification

### Grok Voice Agent (`grok_voice`)
- xAI realtime Voice Agent WebSocket using `grok-voice-think-fast-1.0`
- Bangla voices: `rohan`, `pooja`, `anika`, `tanvir`, each with selectable tone/style
- Supports `audio/pcmu` for the low-latency FreeSWITCH bridge or PCM at configurable sample rates
- **Use case**: premium realtime assistants beside Gemini Live when xAI voice quality/tools are preferred

### Tier 2 — Pipeline (`pipeline`)
- STT: Deepgram **Nova-3** with `language=bn` or multi (Bangla support is solid as of 2025)
- LLM: Gemini **2.5 Flash** (cheap, fast, tool-use)
- TTS: **Cartesia Sonic-2** with a custom Bangla voice (or fall back to Gemini TTS for Bangla until Cartesia voice cloning is dialed in)
- VAD: Silero
- Pipecat composes the pipeline; we add an interruption manager + barge-in
- **Use case**: bulk outbound (debt collection, appointment reminders)

### Tier 3 — DTMF / IVR (`dtmf`)
- Pre-generated audio cached in S3 (or local MinIO), keyed by `(agentId, nodeId, voiceId, locale, contentHash)`
- FreeSWITCH `play_and_get_digits` for menu navigation
- Optional: small Gemini Flash call between branches when free-form input is needed (we still capture by DTMF or recorded speech → Deepgram one-shot)
- **Use case**: simple surveys, OTP confirmation, branch lookup, BTRC-compliant disclosure flows

### Tier router (request side)
The web app stamps `tier` on the agent. The voice service simply instantiates the correct Pipecat pipeline class. No per-call branching logic in dialplan — FreeSWITCH always bridges to the same ESL endpoint and passes `agent_id`.

## 5. Telephony topology

```
Caller (PSTN) ── Any SIP trunk / carrier ──▶ FreeSWITCH (SG/BD VPS)
                                                       │
                                          ┌────────────┴────────────┐
                                          │                         │
                                  mod_audio_fork              mod_dptools
                                  (WebSocket audio)          (DTMF, playback)
                                          │                         │
                                          ▼                         ▼
                                  Pipecat pipeline (T1/T2)   Static IVR (T3)
                                          │
                                          └─▶ MongoDB / Redis / S3
```

- FreeSWITCH uses **mod_audio_fork** (or `mod_audio_stream`) to fork raw PCM to the voice service over WebSocket — keeps RTP on FS, AI on Python
- ESL (`mod_event_socket`) handles control plane: originate calls, hangup, DTMF events, transfer
- Codec: **PCMU/PCMA** at the trunk edge (most BD trunks); transcoded to L16/16k internally for AI
- DID inbound: `sofia/external/<did>` → `socket:127.0.0.1:8084` async full → ESL handler picks tier

### Self-serve SIP provider setup

Users add any SIP provider from the dashboard by entering their E.164 number,
provider name, username, password, and SIP server IP/domain. Optional fields cover
proxy, realm, auth username, register/no-register, transport, and codec prefs. The
dashboard renders FreeSWITCH gateway XML from those rows; no hardcoded carrier list
is required.

## 6. Compliance & BD-specific concerns

- **BTRC**: Robocalling is regulated. We enforce a **Do-Not-Call (DNC)** list per Org, opt-out keyword detection, and a forced disclosure prelude on outbound (`"This is an automated call from <Org>. Press 9 to opt out."`)
- **Recording consent**: configurable; default ON, with an audible disclosure
- **NID/PII**: agents can be flagged `pii_redact=true`, transcripts run through a redactor before storage
- **bKash/Nagad billing**: pluggable `PaymentProvider`. MVP ships with manual top-ups + Stripe; bKash gateway is a follow-up (their API is whitelisted/contracted)
- **Bangla quality**: we'll ship a small eval set (50 BD utterances across dialects — Dhaka, Sylheti, Chittagonian) and run it on every prompt change

## 7. Cost model (rough, in BDT)

Assume 1 minute of conversation, 100/min words, USD = 120 BDT:

| Tier | STT | LLM | TTS | SIP (BD trunk) | Total ≈ |
|---|---|---|---|---|---|
| T1 Gemini Live | (bundled) | ~৳3.0 | (bundled) | ৳0.8 | **৳3.8/min** |
| Grok Voice | (bundled) | ~৳6.0 | (bundled) | ৳0.8 | **৳6.8/min** |
| T2 Pipeline | ৳0.6 (Deepgram) | ৳0.4 (Flash) | ৳1.8 (Cartesia) | ৳0.8 | **৳3.6/min** |
| T3 DTMF | ৳0 (cached) | ৳0.05 | ৳0 (cached) | ৳0.8 | **৳0.85/min** |

Retell-style markup: charge ৳7/min (T1/Grok Voice), ৳6/min (T2), ৳2/min (T3). These are placeholders — we'll surface them in the pricing page and let you tune.

## 8. Security

- All API keys (Gemini, Deepgram, Cartesia, SIP) live in env / Vault, never the DB
- Per-Org API keys hashed with Argon2id
- FreeSWITCH ESL bound to localhost; voice service authenticates via shared secret + mTLS in prod
- Webhook signatures: HMAC-SHA256 with per-webhook secret, replay protection via `t=` timestamp
- Rate limits per Org via Redis token bucket

## 9. Build phases

**Phase A — this PR (scaffold + dashboard skeleton)**
1. Monorepo structure, lint/format, CI
2. Next.js dashboard: auth, org switcher, agents list, agent editor (3-tier picker), phone numbers, call logs (mock), billing skeleton, settings
3. Marketing landing (bilingual)
4. Python voice service skeleton with the three tier classes + FastAPI health
5. FreeSWITCH config: dialplan, sofia profile, multi-provider trunk templates
6. Docker compose for local dev

**Phase B — wiring (next PRs)**
- Real Pipecat pipelines per tier
- ESL bridge: originate, fork audio, DTMF events
- Knowledge base ingestion (pgvector or Mongo Atlas Vector Search)
- Campaigns + outbound dialer
- Webhooks + public REST API
- bKash payment provider

**Phase C — polish**
- Per-tier eval harness (Bangla utterance set)
- Per-call latency dashboard
- BTRC compliance audit pack
