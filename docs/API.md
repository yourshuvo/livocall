# Public REST API v1

Base URL: `https://<your-deployment>/api/v1`
All endpoints accept and return JSON. Times are ISO-8601 UTC. Money values are in **paisa** (1 BDT = 100 paisa).

## Authentication

Send your API key as a Bearer token in the `Authorization` header.

```
Authorization: Bearer lvo_<plaintext>
```

API keys are issued from the dashboard under **Settings → API Keys**. Each key has a name, scopes, and an immutable prefix used in the dashboard for identification. The plaintext is shown **only once** at creation — store it in a secret manager.

### Scopes

| Scope            | Endpoints                                                |
|------------------|----------------------------------------------------------|
| `calls:read`     | `GET /calls`, `GET /calls/{id}`                          |
| `calls:write`    | `POST /calls`, `DELETE /calls/{id}` (hangup)             |
| `agents:read`    | `GET /agents`, `GET /agents/{id}`                        |
| `dnc:read`       | `GET /dnc`                                               |
| `dnc:write`      | `POST /dnc`, `DELETE /dnc?e164=…`                        |
| `*`              | All of the above (use sparingly)                         |

## Errors

```json
{
  "error": {
    "code": "not_found",
    "message": "agent not found",
    "details": null
  }
}
```

| HTTP | code               | When                                              |
|------|--------------------|---------------------------------------------------|
| 400  | `invalid_input`    | Malformed body / query                            |
| 401  | `unauthenticated`  | Missing / invalid API key                         |
| 403  | `forbidden`        | Scope missing, DNC hit, insufficient credits     |
| 404  | `not_found`        | Object does not exist or does not belong to org   |
| 409  | `conflict`         | E.g. hanging up a call that is not in progress    |
| 429  | `rate_limited`     | Per-key bucket: 60 burst / 5 per second           |
| 502  | `upstream_error`   | Voice service unreachable                         |

## Calls

### Originate a call

```
POST /api/v1/calls
```

Body:

```json
{
  "agent_id": "65a1b2c3d4e5f6a7b8c9d0e1",
  "to_e164": "+8801711000000",
  "from_e164": "+8809610000000",
  "metadata": { "campaign": "may_promo" }
}
```

`from_e164` is optional — if omitted, the org's default outbound number is used. `metadata` is a free-form `string→string` map carried into webhooks.

Response:

```json
{ "callId": "65a1…", "fsUuid": "9f3e…", "queued": true }
```

### Get a call

```
GET /api/v1/calls/{id}
```

Response is the full Call object (see [Call schema](#call-object)).

### List calls

```
GET /api/v1/calls?limit=50&outcome=completed
```

Optional filters: `outcome` (`completed`, `no_answer`, `busy`, `failed`, `voicemail`, `in_progress`).

### Hang up a call

```
DELETE /api/v1/calls/{id}
```

`409 conflict` if the call has already ended.

## Agents

### List

```
GET /api/v1/agents
```

### Read

```
GET /api/v1/agents/{id}
```

## Do-Not-Call list

The DNC list is per-org and is consulted on every outbound originate. Agents and the public REST API both refuse to dial a number on the org's DNC list.

### List

```
GET /api/v1/dnc
```

### Add

```
POST /api/v1/dnc
{
  "e164": "+8801711000000",
  "reason": "user_request",
  "note": "Caller asked to be removed during call 65a1…"
}
```

`reason` ∈ `user_request | btrc_complaint | opt_out_keyword | manual`.

### Remove

```
DELETE /api/v1/dnc?e164=%2B8801711000000
```

## Call object

```json
{
  "id": "65a1…",
  "orgId": "65a1…",
  "agentId": "65a1…",
  "direction": "outbound",
  "fromE164": "+8809610000000",
  "toE164": "+8801711000000",
  "tier": "pipeline",
  "startedAt": "2025-04-27T14:00:00.000Z",
  "endedAt": "2025-04-27T14:01:42.000Z",
  "durationSec": 102,
  "audioUrl": null,
  "transcript": [
    { "role": "agent", "text": "আসসালামু আলাইকুম", "at": "2025-04-27T14:00:01.000Z" },
    { "role": "user",  "text": "ওয়ালাইকুম",        "at": "2025-04-27T14:00:03.500Z" }
  ],
  "cost": {
    "sttPaisa": 204,
    "llmPaisa": 132,
    "ttsPaisa": 600,
    "sipPaisa": 264,
    "totalPaisa": 1200
  },
  "outcome": "completed",
  "sentiment": null,
  "summary": null,
  "dtmfPath": null
}
```

## Rate limits

The public API enforces a token bucket of **60 burst / 5 per second per API key**. The dashboard API uses the same bucket scheme but per-org-per-route. When the bucket is empty, you receive `429 rate_limited`.

## Webhooks

See [WEBHOOKS.md](./WEBHOOKS.md) for the event catalog, payload shapes, and HMAC verification.

## Pagination

List endpoints accept `?limit=<n>` (default 50, max 200). Cursor pagination is reserved (`?cursor=…`) — pass through any cursor returned by the server.
