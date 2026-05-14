# LivoCall for Shopify — Order confirmation calls

Calls a customer when their Shopify order moves through interesting states (created, paid, fulfilled, abandoned cart). Per-topic triggers, per-trigger agent override, quiet hours, and `customers/redact` → DNC are all configurable.

Two install paths:

## A. Direct webhook (no app needed)

In Shopify admin → **Settings → Notifications → Webhooks**:

| Event | Format | URL |
|-------|--------|-----|
| `orders/create`           | JSON | `https://<your-livocall-host>/api/connections/shopify/webhook?cid=<connection-id>` |
| `orders/paid`             | JSON | same URL |
| `orders/fulfilled`        | JSON | same URL |
| `checkouts/create`        | JSON | same URL |
| `customers/create`        | JSON | same URL |
| `customers/update`        | JSON | same URL |
| `customers/redact` (GDPR) | JSON | same URL |

`<connection-id>` is the id from LivoCall → **Connections → Active connections**. The receiver verifies Shopify's `X-Shopify-Hmac-Sha256` header against the secret on the connection.

In the connection's **config** JSON, set:

```json
{
  "shopifySharedSecret": "<your-shopify-app-secret>",
  "defaultAgentId":      "<livocall-agent-id>",
  "defaultFromE164":     "+8809610000000",
  "triggers": {
    "orders/create":    { "enabled": true },
    "orders/paid":      { "enabled": true,  "agentId": "<override>" },
    "orders/fulfilled": { "enabled": true },
    "checkouts/create": { "enabled": false }
  },
  "quietHours": { "startMinutes": 1320, "endMinutes": 480 },
  "timezone":   "Asia/Dhaka"
}
```

`startMinutes`/`endMinutes` are minutes-from-midnight in `timezone`. `1320 = 22:00`, `480 = 08:00`.

## B. Standalone Node sidecar

If you'd rather sit between Shopify and LivoCall yourself (so you can enrich the payload, log to your own DB, etc.), use the sidecar in this folder.

```bash
cp .env.example .env  # edit, then:
npm install
node server.js
```

Point Shopify webhooks at `http://<sidecar>:<port>/shopify/webhook`. The sidecar verifies HMAC and forwards configured triggers to LivoCall.

Per-topic agent overrides are supported in `LIVOCALL_TRIGGERS`:

```
LIVOCALL_TRIGGERS=orders/create,orders/paid:65a1234567890abcdef,orders/fulfilled
```

Quiet hours via `LIVOCALL_QUIET_HOURS=HH:MM-HH:MM` interpreted in `LIVOCALL_TZ`.
