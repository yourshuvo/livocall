# Webhooks

livocall fires webhooks for important call lifecycle and account events. They use a Stripe-style signature so you can verify integrity and reject replays.

## Configuring a webhook

Dashboard → **Settings → Webhooks → + New webhook**:

* **URL** – HTTPS endpoint that receives `POST` requests with a JSON body.
* **Events** – one or more event types from the catalog below.
* **Secret** – generated once on creation. Copy it into your verification code; livocall **does not show it again**.

You can have multiple webhooks per org subscribed to overlapping events.

## HTTP details

* Method: `POST`
* `Content-Type: application/json`
* `User-Agent: livocall-webhook/1`
* Header `livocall-signature: t=<unix-seconds>,v1=<hex-sha256>`

Request body:

```json
{
  "id": "evt_2025_04_27_xyz",
  "type": "call.completed",
  "createdAt": "2025-04-27T14:01:43.000Z",
  "orgId": "65a1…",
  "data": { ... event-specific payload ... }
}
```

## Verifying the signature

The signature is `HMAC-SHA256(secret, "<t>.<raw-body>")`. Reject any request whose timestamp is more than 5 minutes off your clock.

### Node.js

```js
import crypto from 'node:crypto'

export function verifyLivoCall(secret, rawBody, header, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')))
  const t = Number(parts.t)
  const v1 = parts.v1
  if (!t || !v1) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))
}
```

### Python

```python
import hmac, hashlib, time

def verify_livocall(secret: str, raw_body: bytes, header: str, tolerance_sec: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    try:
        t = int(parts["t"])
        v1 = parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs(int(time.time()) - t) > tolerance_sec:
        return False
    mac = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, v1)
```

> ⚠️ **Use the raw body**, not the parsed JSON, when computing the HMAC. Re-serialising re-orders keys and breaks verification.

## Delivery & retries

* Webhooks are queued asynchronously and delivered by a background tick.
* Delivery has a 10-second timeout. Any non-2xx response triggers a retry.
* Backoff: `4 ^ attempts` seconds, capped at 24 hours.
* Max attempts: **8**. After that the delivery is moved to a dead-letter state and `lastDeliveryStatus` reflects it.
* Reply with **2xx** within 10 seconds to acknowledge. Anything else (including 3xx) counts as a failure.

You can re-trigger the delivery cron from a privileged caller via `POST /api/internal/webhook-tick` (requires the `VOICE_SHARED_SECRET` bearer token).

## Event catalog

All payloads include the envelope above; the table lists the `data` shape.

| Event              | When                                                      | `data` keys                                                                                |
|--------------------|-----------------------------------------------------------|--------------------------------------------------------------------------------------------|
| `call.started`     | A call has been originated and FreeSWITCH accepted it.    | `callId`, `agentId`, optionally `fsUuid`                                                  |
| `call.completed`   | The call ended cleanly.                                   | `callId`, `agentId`, `outcome` (`"completed"`), `durationSec`, `cost.{stt,llm,tts,sip,total}Paisa` |
| `call.failed`      | The call ended with an error (busy, no_answer, failed).   | Same as `call.completed`, but `outcome` reflects the failure mode.                         |
| `call.transferred` | The call was transferred to a human / external number.    | `callId`, `target`                                                                         |
| `agent.updated`    | An agent's configuration was changed via dashboard / API. | `agentId`                                                                                  |
| `topup.confirmed`  | A successful credit top-up was recorded.                  | `amountPaisa`, `provider`, `balanceAfterPaisa`                                            |
| `campaign.completed` | An outbound campaign reached `completed` status.        | `campaignId`, `stats.{total,attempted,completed,failed,noAnswer}`                          |

### Example: `call.completed`

```json
{
  "id": "evt_2025_04_27_x1",
  "type": "call.completed",
  "createdAt": "2025-04-27T14:01:43.000Z",
  "orgId": "65a1…",
  "data": {
    "callId": "65a1…",
    "agentId": "65a1…",
    "outcome": "completed",
    "durationSec": 102,
    "cost": {
      "sttPaisa": 204,
      "llmPaisa": 132,
      "ttsPaisa": 600,
      "sipPaisa": 264,
      "totalPaisa": 1200
    }
  }
}
```

## Replay protection

Reject signatures whose timestamp is more than 5 minutes off your clock. livocall signs each delivery (including retries) with the **current** timestamp, so retries get a fresh signature; they are not replays.
