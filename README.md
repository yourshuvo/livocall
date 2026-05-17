# LivoCall

A self-serve AI voice-call platform for Bangladeshi businesses — multi-engine voice stack (Gemini Live, Grok Voice Agent, Deepgram+Gemini Flash+Cartesia, DTMF+Gemini TTS) over FreeSWITCH on local BD SIP trunks.

> See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design doc.

## Repo layout

```
apps/web              Next.js 14 dashboard + marketing site (TS, Tailwind, Mongo)
services/voice        FastAPI + Pipecat voice engine (Python 3.11)
infra/freeswitch      FreeSWITCH dialplan, sofia profiles, ACL
infra/sip-trunks      Custom SIP provider gateway template + render helper
infra/docker          docker-compose for local dev
packages/shared       Shared TypeScript types
docs/                 Architecture, runbooks, BD SIP provider notes
```

## Quick start (local dev)

```bash
# 1. Install web deps
pnpm install

# 2. Copy env
cp apps/web/.env.example apps/web/.env.local

# 3. Run web (uses local Mongo via docker-compose)
docker compose -f infra/docker/docker-compose.yml up -d mongo redis
pnpm dev
# → http://localhost:3000
```

## Voice engine

```bash
cd services/voice
uv sync
uv run uvicorn app.main:app --reload --port 8084
```

## FreeSWITCH (local)

```bash
docker compose -f infra/docker/docker-compose.yml up -d freeswitch
docker exec -it livocall-fs fs_cli
```

## Production deployment

For a single-VPS Coolify deployment with host-network FreeSWITCH, use
[`DEPLOYMENT_COOLIFY_FREESWITCH.md`](./DEPLOYMENT_COOLIFY_FREESWITCH.md) and
[`infra/docker-compose.prod.yml`](./infra/docker-compose.prod.yml), with
[`infra/.env.prod.example`](./infra/.env.prod.example) as the combined env
template. The production compose file is aligned with the app runtime settings:
web listens on `3000`, voice listens on `8084`, both apps use `MONGODB_URI`,
web calls voice with `VOICE_SERVICE_TOKEN`, and voice calls web with
`WEB_SHARED_SECRET` using the same value as web's `VOICE_SHARED_SECRET`.

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 14 App Router, TypeScript, Tailwind, Auth.js, Mongoose |
| Voice | Python 3.11, FastAPI, Pipecat, asyncio |
| Telephony | FreeSWITCH 1.10 with mod_audio_fork + ESL |
| AI | Gemini Live / 2.5 Flash / TTS, Grok Voice Agent, Deepgram Nova-3, Cartesia Sonic-2 |
| Data | MongoDB Atlas (or local Mongo), Redis |

## Status

This is the **scaffold PR**. See `ARCHITECTURE.md §9` for the build phases. We are at end of Phase A.
