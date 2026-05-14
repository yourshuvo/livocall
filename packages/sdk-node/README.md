# @livocall/sdk

Official Node.js SDK for the [LivoCall](https://bd.voice) REST API.

## Install

```bash
pnpm add @livocall/sdk
# or
npm install @livocall/sdk
```

Requires Node.js 18+ (for the global `fetch`).

## Quick start

```ts
import { LivoCallClient } from '@livocall/sdk'

const bd = new LivoCallClient({ apiKey: process.env.LIVOCALL_API_KEY! })

// List your agents
const { data: agents } = await bd.agents.list()

// Originate a call
const call = await bd.calls.originate({
  agent_id: agents[0].id,
  to_e164: '+8801711111111',
})

// Later on, fetch the recorded transcript + audio URL
const detail = await bd.calls.get(call.id)
```

## Endpoints covered

| Group       | Methods                                         |
| ----------- | ----------------------------------------------- |
| `agents`    | `list`, `get`                                   |
| `calls`     | `list`, `get`, `originate`                      |
| `numbers`   | `list`, `create`                                |
| `contacts`  | `list`, `upsert`                                |
| `campaigns` | `list`, `create`, `start`, `pause`              |
| `usage`     | `get`                                           |

All methods return strongly typed objects. Failures throw `LivoCallApiError`
with `status`, `code`, `message`, and optional `details` fields.

See the full [OpenAPI spec](https://app.bd.voice/api/v1/openapi.json) for
the complete contract.

## Options

```ts
new LivoCallClient({
  apiKey: 'lvo_live_...',        // required
  baseUrl: 'https://my.host',    // override for self-hosted installs
  timeoutMs: 30_000,             // per-request timeout
  fetch: customFetchImpl,        // e.g. undici or node-fetch
})
```

## License

MIT
