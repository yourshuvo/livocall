# LivoCall

<div align="center">

**Enterprise Self-Serve AI Voice Calling Platform for Bangladeshi & Global Telephony**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14_App_Router-black?logo=next.js)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![Pipecat AI](https://img.shields.io/badge/Pipecat-Voice_Orchestration-orange)](https://pipecat.ai)
[![Telephony](https://img.shields.io/badge/Telephony-Embedded_PJSIP_SIP%2FRTP-purple)](https://www.pjsip.org/)

[Features](#-key-features) •
[Architecture](#-architecture) •
[Tech Stack](#-tech-stack) •
[Quick Start](#-quick-start) •
[Configuration](#-environment-configuration) •
[Deployment](#-production-deployment) •
[Integrations](#-plugins--integrations)

</div>

---

## 📌 Overview

**LivoCall** is a production-grade, self-serve conversational AI voice calling platform engineered specifically for low-latency voice interactions over local Bangladeshi SIP trunks (BTCL, Brilliant, AmberIT, etc.) and global PSTN carriers.

Featuring an **embedded PJSIP SIP/RTP edge directly in Python**, LivoCall removes the operational complexity of external PBX setups (such as FreeSWITCH or Asterisk), streaming bidirectional PCM audio directly between local telephony providers and frontier multi-modal voice models with sub-second response times.

---

## 🚀 Key Features

* **🎙️ Multi-Tier AI Voice Engines**
  * **Gemini Live**: Native, ultra-responsive bidirectional multimodal audio streaming.
  * **Grok Voice Agent**: Low-latency conversational audio streaming via WebSocket.
  * **Pipecat Pipeline**: Modular STT → LLM → TTS pipeline using Deepgram Nova-3, Gemini 2.5 Flash, and Cartesia Sonic-2.
  * **DTMF IVR**: Interactive keypad-driven phone menus with dynamic Gemini TTS fallback.

* **📞 Embedded PJSIP Telephony Edge**
  * Direct C-level SIP signaling and RTP media streaming within the voice engine runtime.
  * Zero external PBX, XML dialplan, or sideband media forking dependencies.
  * Inbound DID routing and dynamic SIP trunk credential hot-reloading (`POST /pjsip/reload`).

* **⚡ Real-Time WebRTC Webcall**
  * In-browser voice agent testing and public embeddable webcall widgets via `@pipecat-ai/client-js` and signed WebRTC sessions.

* **🤖 Agent Studio & Knowledge Base (RAG)**
  * Intuitive agent prompt crafting, personality tuning, voice selection, and language adaptation (Bengali and English).
  * Automated document ingestion (DOCX, HTML, text) for grounded agent responses.

* **📊 Observability & Analytics**
  * Live call monitoring, dual-channel audio recordings, diarized transcripts, sentiment tracking, and latency telemetry.

* **🔌 Native E-Commerce & CRM Connectors**
  * Official plugins for **WordPress / WooCommerce** and **Shopify** for automated order verification, COD confirmations, and customer callbacks.

* **🛡️ Security & Compliance**
  * Built-in Do Not Call (DNC) list enforcement.
  * AES-256 encrypted SIP credentials (`SIP_CREDENTIAL_SECRET`).
  * HMAC-signed internal service-to-service communication (`VOICE_SERVICE_TOKEN` & `VOICE_SHARED_SECRET`).

---

## 🏗️ Architecture

```
                                  +-----------------------------+
                                  |     Customer / PSTN         |
                                  +--------------+--------------+
                                                 | SIP / RTP
                                                 v
+------------------------+        +-----------------------------+
|    Next.js Web App     |        |   services/voice (FastAPI)  |
|      (Port 3000)       |        |         (Port 8084)         |
|                        |        |                             |
|  * Admin Dashboard     | HTTP   |  * Embedded PJSIP Edge      |
|  * Agent Management    +------->|  * RTP Media Bridge (PCM)   |
|  * SIP Trunk Config    | Token  |  * Audio In/Out Normalizer  |
|  * Webcall Test Studio |        |                             |
|  * Billing & Top-ups   |<-------+  * Multi-Tier Voice Stack:  |
+-----------+------------+ Events |     - Gemini Live           |
            |                     |     - Grok Voice Agent      |
            |                     |     - Pipecat Pipeline      |
            v                     |     - DTMF / IVR Engine     |
+------------------------+        +--------------+--------------+
|     MongoDB & Redis    |                       |
|  * Call Logs & States  |<----------------------+
|  * Transcripts & Auth  |
+------------------------+
```

### Call Flow Lifecycles

* **Outbound Calls**: Dashboard/API triggers `POST /calls/originate` on the voice service → Voice service dials out via the configured PJSIP carrier → Once answered, RTP audio connects directly to the selected AI engine tier → Lifecycle, recording, and transcript events post back to web internal endpoints.
* **Inbound Calls**: Carrier SIP invite arrives at PJSIP port `5070` → Account DID is matched against Mongo to load agent prompt and configuration → Voice adapter establishes the AI session → Call summaries and metrics stream back to the dashboard.

---

## 📂 Repository Layout

```text
├── apps/
│   └── web/                   # Next.js 14 App Router dashboard & marketing platform
├── services/
│   └── voice/                 # FastAPI + Pipecat voice engine with embedded PJSIP
├── packages/
│   └── shared/                # Shared TypeScript types and utilities
├── plugins/
│   ├── livocall-wp/           # WordPress / WooCommerce integration plugin
│   └── livocall-shopify/      # Shopify e-commerce integration app
├── infra/
│   ├── docker/                # Local development Docker Compose services
│   ├── docker-compose.prod.yml# Production compose configuration (Coolify/VPS)
│   └── sip-trunks/            # SIP trunking notes and provider guidelines
└── docs/                      # Technical specifications, architecture docs, runbooks
```

---

## 💻 Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend & Web API** | Next.js 14, React 19, Tailwind CSS, TypeScript | Server Components, fast UI, unified API routes |
| **Auth & Security** | Clerk / Auth.js, AES-256 encryption | Robust enterprise user access and secret protection |
| **Voice Engine** | Python 3.11+, FastAPI, Uvicorn, asyncio | High-concurrency async I/O for real-time streaming |
| **Telephony Edge** | Embedded PJSIP / `pjsua2` | Zero-latency direct SIP/RTP media bridging |
| **Voice Orchestration**| Pipecat AI | Unified pipeline for STT, LLM, TTS, and VAD |
| **AI Models** | Gemini Live, Grok Voice, Deepgram, Cartesia | Multi-model flexibility for cost, latency, and Bengali nuance |
| **Database & Cache** | MongoDB 7, Redis 7 | Flexible document storage and fast distributed state locks |
| **Storage** | S3-compatible (AWS / Cloudflare R2 / MinIO) | Scalable call recording and audio asset storage |

---

## 🛠️ Quick Start

### Prerequisites
* **Node.js** `>= 20` (Node 24 recommended) and **pnpm** `>= 9`
* **Python** `>= 3.11` and [`uv`](https://docs.astral.sh/uv/) (or `pip`)
* **Docker & Docker Compose**

### 1. Clone the Repository
```bash
git clone https://github.com/yourshuvo/livocall.git
cd livocall
```

### 2. Start Local Databases
Launch local MongoDB and Redis instances using the included development compose file:
```bash
docker compose -f infra/docker/docker-compose.yml up -d mongo redis
```

### 3. Setup and Run the Web App
```bash
# Install dependencies
pnpm install

# Configure environment
cp apps/web/.env.example apps/web/.env.local

# Start Next.js development server
pnpm --filter @livocall/web dev
# -> Dashboard running at http://localhost:3000
```

### 4. Setup and Run the Voice Engine
```bash
cd services/voice

# Configure environment
cp .env.example .env

# Install dependencies using uv
uv sync

# Run FastAPI server
uv run uvicorn app.main:app --reload --port 8084
# -> Voice API running at http://localhost:8084
```

---

## ⚙️ Environment Configuration

### Web Application (`apps/web/.env.local`)
| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string (`mongodb://localhost:27017/livocall`) |
| `REDIS_URL` | Redis connection URL (`redis://localhost:6379/0`) |
| `VOICE_SERVICE_URL` | Base URL of voice service (`http://localhost:8084`) |
| `VOICE_SERVICE_TOKEN` | Bearer token for authenticating calls to the voice engine |
| `VOICE_SHARED_SECRET` | Secret key shared between web and voice for event signing |
| `SIP_CREDENTIAL_SECRET`| Encryption key used to secure carrier SIP passwords at rest |

### Voice Engine (`services/voice/.env`)
| Variable | Description |
|---|---|
| `TELEPHONY_EDGE` | Telephony backend: `pjsip` (default) |
| `PJSIP_LOCAL_SIP_PORT`| SIP signaling port (`5070` by default) |
| `PJSIP_RTP_PORT_START`| Beginning of RTP port range (`20000`) |
| `PJSIP_RTP_PORT_RANGE`| Number of UDP ports allocated for RTP (`10000`) |
| `PJSIP_PUBLIC_ADDRESS`| External server IP for NAT traversal |
| `GEMINI_API_KEY` | Google Gemini API key for Gemini Live and Flash models |
| `DEEPGRAM_API_KEY` | Deepgram API key for speech-to-text |
| `CARTESIA_API_KEY` | Cartesia API key for high-fidelity text-to-speech |
| `XAI_API_KEY` | xAI API key for Grok Voice Agent |

---

## 🚢 Production Deployment

LivoCall supports single-VPS deployments via **Coolify** or standard Docker Compose using [`infra/docker-compose.prod.yml`](./infra/docker-compose.prod.yml).

### Network & Firewall Rules
Ensure the required ports are accessible on your host firewall:

```bash
# Web & API Traffic
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Voice Engine SIP Signaling & RTP Audio
sudo ufw allow 5070/udp
sudo ufw allow 20000:30000/udp
```

### Production Launch
```bash
# 1. Create combined production environment file
cp infra/.env.prod.example infra/.env.prod

# 2. Edit environment secrets
nano infra/.env.prod

# 3. Launch stack
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d
```

> **Note on NAT Traversal**: If deploying on a cloud provider with private IP networking (AWS EC2, Hetzner behind NAT, DigitalOcean), set `PJSIP_PUBLIC_ADDRESS=<YOUR_PUBLIC_IP>` to ensure carrier SIP audio routes properly.

---

## 🔌 Plugins & Integrations

### WordPress / WooCommerce (`plugins/livocall-wp`)
Automates post-checkout verification calls and shipping confirmation with dynamic order details.
* Upload `plugins/livocall-wp` to your WordPress `wp-content/plugins/` directory.
* Activate via WP Admin and connect your LivoCall API key under settings.

### Shopify (`plugins/livocall-shopify`)
Listens to Shopify webhook events (`orders/create`, `checkouts/abandoned`) to initiate conversational voice workflows.

---

## 🧪 Testing & Verification

```bash
# Run web unit & integration tests
pnpm --filter @livocall/web test

# Run voice service test suite
cd services/voice
uv run pytest

# Linting and formatting
pnpm lint
uv run ruff check .
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
