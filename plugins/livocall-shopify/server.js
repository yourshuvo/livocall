// Shopify → LivoCall sidecar — order-confirmation focused.
//
// Verifies Shopify HMAC, then forwards relevant events to LivoCall. Per-topic
// triggers, per-trigger agent override, quiet-hours window, and DNC on
// `customers/redact` are all configurable via env vars.

import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.env.PORT || 8787)
const LIVOCALL_BASE = process.env.LIVOCALL_BASE || 'https://your-livocall-host'
const LIVOCALL_KEY = process.env.LIVOCALL_KEY || ''
const SHOPIFY_SECRET = process.env.SHOPIFY_SECRET || ''

// Default agent + per-trigger overrides
const DEFAULT_AGENT = process.env.LIVOCALL_DEFAULT_AGENT_ID || ''
const DEFAULT_FROM = process.env.LIVOCALL_DEFAULT_FROM || ''

// Triggers — comma-separated list of `topic[:agentId]` pairs.
// Examples:
//   LIVOCALL_TRIGGERS="orders/create,orders/paid:65a1abc,orders/fulfilled"
//   LIVOCALL_TRIGGERS="checkouts/create"
const TRIGGERS = parseTriggers(process.env.LIVOCALL_TRIGGERS || '')

// Quiet hours, e.g. "22:00-08:00" in the timezone TZ env var (default Asia/Dhaka).
const QUIET = parseQuiet(process.env.LIVOCALL_QUIET_HOURS || '')
const TZ = process.env.LIVOCALL_TZ || process.env.TZ || 'Asia/Dhaka'

if (!LIVOCALL_KEY) {
  console.error('LIVOCALL_KEY env var is required')
  process.exit(1)
}

function parseTriggers(spec) {
  const out = {}
  spec.split(',').map((s) => s.trim()).filter(Boolean).forEach((t) => {
    const [topic, agentId] = t.split(':').map((s) => s.trim())
    out[topic] = { agentId: agentId || '' }
  })
  return out
}

function parseQuiet(spec) {
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(spec)
  if (!m) return null
  return {
    start: Number(m[1]) * 60 + Number(m[2]),
    end: Number(m[3]) * 60 + Number(m[4]),
  }
}

function minutesInTz(now, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour').value)
    const m = Number(parts.find((p) => p.type === 'minute').value)
    return h * 60 + m
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  }
}

function isQuietNow() {
  if (!QUIET) return false
  if (QUIET.start === QUIET.end) return false
  const m = minutesInTz(new Date(), TZ)
  return QUIET.start < QUIET.end ? m >= QUIET.start && m < QUIET.end : m >= QUIET.start || m < QUIET.end
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function livocall(path, body) {
  const r = await fetch(`${LIVOCALL_BASE}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${LIVOCALL_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.text() }
}

function pickPhone(o) {
  return o.phone || o.customer?.phone || o.shipping_address?.phone || null
}

function customerName(o) {
  return [
    o.customer?.first_name ?? o.shipping_address?.first_name ?? '',
    o.customer?.last_name ?? o.shipping_address?.last_name ?? '',
  ].filter(Boolean).join(' ')
}

function lineItems(o) {
  if (!Array.isArray(o.line_items)) return ''
  return o.line_items.map((it) => `${it.title ?? ''} × ${it.quantity ?? 1}`.trim()).filter(Boolean).join(', ')
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/shopify/webhook')) {
    res.writeHead(404).end()
    return
  }
  const raw = await readBody(req)
  const sig = req.headers['x-shopify-hmac-sha256']
  if (SHOPIFY_SECRET) {
    const expected = crypto.createHmac('sha256', SHOPIFY_SECRET).update(raw).digest('base64')
    if (expected !== sig) {
      res.writeHead(401).end('bad signature')
      return
    }
  }

  const topic = String(req.headers['x-shopify-topic'] || '')
  let body
  try {
    body = JSON.parse(raw.toString('utf8'))
  } catch {
    res.writeHead(400).end('bad json')
    return
  }

  res.writeHead(200, { 'content-type': 'application/json' })

  try {
    if (topic === 'customers/redact') {
      const phone = body.phone || body.customer?.phone
      if (phone) {
        await livocall('/api/v1/dnc', {
          e164: phone,
          reason: 'user_request',
          note: 'Shopify customers/redact',
        })
      }
      res.end(JSON.stringify({ ok: true, action: 'dnc' }))
      return
    }

    if (topic.startsWith('customers/')) {
      // We deliberately don't sync contacts here — that's what the LivoCall
      // built-in receiver is for. The sidecar focuses on calls.
      res.end(JSON.stringify({ ok: true, ignored: 'contacts handled by main receiver' }))
      return
    }

    const trigger = TRIGGERS[topic]
    if (!trigger) {
      res.end(JSON.stringify({ ok: true, ignored: topic }))
      return
    }

    const phone = pickPhone(body)
    const agentId = trigger.agentId || DEFAULT_AGENT
    if (!phone || !agentId) {
      res.end(JSON.stringify({ ok: true, originated: false, reason: 'missing_phone_or_agent' }))
      return
    }
    if (isQuietNow()) {
      res.end(JSON.stringify({ ok: true, originated: false, reason: 'quiet_hours' }))
      return
    }

    const r = await livocall('/api/v1/calls', {
      agent_id: agentId,
      to_e164: phone,
      from_e164: DEFAULT_FROM || undefined,
      metadata: {
        trigger: topic,
        source: 'shopify_sidecar',
        order_id: String(body.id ?? ''),
        order_number: body.name ?? '',
        currency: body.currency ?? '',
        total: body.total_price ?? '',
        customer: customerName(body),
        items: lineItems(body),
      },
    })
    res.end(JSON.stringify({ ok: true, originated: r.status === 200, body: r.body }))
  } catch (e) {
    console.error('LivoCall forward error', e)
    res.end(JSON.stringify({ ok: false, error: String(e) }))
  }
})

server.listen(PORT, () => {
  console.log(`LivoCall Shopify sidecar listening on :${PORT} (tz=${TZ})`)
})
