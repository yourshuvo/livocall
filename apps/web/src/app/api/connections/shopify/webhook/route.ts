export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Connection } from '@/models/Connection'
import { Contact } from '@/models/Contact'
import { DncEntry } from '@/models/DncEntry'
import { withErrors, apiError } from '@/lib/errors'
import { voiceClient } from '@/lib/voice-client'

/**
 * Shopify webhook receiver — order-confirmation focused.
 *
 * Authentication: Shopify signs every webhook with `X-Shopify-Hmac-Sha256`
 * over the *raw* request body using the app secret. We accept that secret
 * either via the connection's `config.shopifySharedSecret` or via the
 * `?cid=<connection-id>` query string for low-friction setups.
 *
 * Topics handled (each toggleable per connection.config.triggers):
 *   - orders/create           → originate confirmation call
 *   - orders/paid             → originate confirmation call
 *   - orders/fulfilled        → originate "your order shipped" call
 *   - checkouts/create        → recovery call (abandoned cart)
 *   - customers/create|update → upsert into Contact
 *   - customers/redact        → add to DNC + delete contact
 *
 * Connection config schema (all optional):
 * {
 *   shopifySharedSecret: string,     // verifies HMAC if set
 *   defaultAgentId:      string,     // used unless overridden per-trigger
 *   defaultFromE164:     string,
 *   triggers: {
 *     "orders/create":       { enabled: true,  agentId?: string, delaySeconds?: number },
 *     "orders/paid":         { enabled: true,  ... },
 *     "orders/fulfilled":    { enabled: false, ... },
 *     "checkouts/create":    { enabled: false, ... }
 *   },
 *   quietHours: { startMinutes: 22*60, endMinutes: 8*60 },  // local TZ minutes-from-midnight
 *   timezone:   "Asia/Dhaka"
 * }
 */

interface TriggerCfg {
  enabled?: boolean
  agentId?: string
  delaySeconds?: number
}

interface ShopifyConnConfig {
  shopifySharedSecret?: string
  defaultAgentId?: string
  defaultFromE164?: string
  triggers?: Record<string, TriggerCfg>
  quietHours?: { startMinutes?: number; endMinutes?: number }
  timezone?: string
  agentId?: string // legacy (pre-0.2)
  originateOnCheckout?: boolean // legacy
}

const orderSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  total_price: z.string().optional(),
  currency: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  customer: z
    .object({
      phone: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
    })
    .optional(),
  shipping_address: z
    .object({
      phone: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
    })
    .optional(),
  line_items: z
    .array(
      z.object({
        title: z.string().optional(),
        quantity: z.number().optional(),
      }),
    )
    .optional(),
})

type ShopifyOrder = z.infer<typeof orderSchema>

function pickPhone(body: ShopifyOrder): string | null {
  return (
    body.phone ||
    body.customer?.phone ||
    body.shipping_address?.phone ||
    null
  )
}

function pickCustomerName(body: ShopifyOrder): string {
  const a = body.customer?.first_name ?? body.shipping_address?.first_name ?? ''
  const b = body.customer?.last_name ?? body.shipping_address?.last_name ?? ''
  return `${a} ${b}`.trim()
}

function getMinutesInTimezone(now: Date, timezone: string): number {
  // Use Intl to compute the local hour/minute in the given timezone.
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    return h * 60 + m
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  }
}

function isQuietHours(cfg: ShopifyConnConfig, now: Date): boolean {
  const q = cfg.quietHours
  if (!q || q.startMinutes === undefined || q.endMinutes === undefined) return false
  if (q.startMinutes === q.endMinutes) return false
  const tz = cfg.timezone || 'Asia/Dhaka'
  const m = getMinutesInTimezone(now, tz)
  if (q.startMinutes < q.endMinutes) {
    return m >= q.startMinutes && m < q.endMinutes
  }
  return m >= q.startMinutes || m < q.endMinutes
}

function lineItemsString(body: ShopifyOrder): string {
  if (!body.line_items?.length) return ''
  return body.line_items
    .map((it) => `${it.title ?? ''} × ${it.quantity ?? 1}`.trim())
    .filter(Boolean)
    .join(', ')
}

export const POST = withErrors(async (req: Request) => {
  const url = new URL(req.url)
  const cid = url.searchParams.get('cid')
  const topic = req.headers.get('x-shopify-topic') ?? ''
  const shop = req.headers.get('x-shopify-shop-domain') ?? ''
  const sig = req.headers.get('x-shopify-hmac-sha256') ?? ''
  const raw = await req.text()

  await connectMongo()
  const conn = cid
    ? await Connection.findOne({ _id: cid, platform: 'shopify' })
    : await Connection.findOne({ platform: 'shopify', siteUrl: shop })
  if (!conn) return apiError('not_found', 'no shopify connection matches this request')

  const cfg = ((conn.config as Record<string, unknown> | null) ?? {}) as ShopifyConnConfig
  if (cfg.shopifySharedSecret) {
    const expected = crypto
      .createHmac('sha256', cfg.shopifySharedSecret)
      .update(raw, 'utf8')
      .digest('base64')
    if (expected !== sig) return apiError('forbidden', 'bad shopify signature')
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return apiError('invalid_input', 'request body is not JSON')
  }

  // ----- Customer redact ----------------------------------------------------
  if (topic === 'customers/redact') {
    const phone =
      (body as { phone?: string; customer?: { phone?: string } })?.phone ??
      (body as { customer?: { phone?: string } })?.customer?.phone
    if (phone) {
      await DncEntry.updateOne(
        { orgId: conn.orgId, e164: phone },
        { $setOnInsert: { reason: 'user_request', note: 'Shopify customers/redact' } },
        { upsert: true },
      )
      await Contact.deleteMany({ orgId: conn.orgId, e164: phone })
    }
    return NextResponse.json({ ok: true })
  }

  // ----- Customer create/update --------------------------------------------
  if (topic.startsWith('customers/')) {
    const c = body as {
      phone?: string
      first_name?: string
      last_name?: string
      tags?: string
    }
    const phone = c.phone
    if (phone) {
      await Contact.updateOne(
        { orgId: conn.orgId, e164: phone },
        {
          $set: {
            name: [c.first_name, c.last_name].filter(Boolean).join(' '),
            tags: typeof c.tags === 'string' ? c.tags.split(',').map((t) => t.trim()) : [],
          },
        },
        { upsert: true },
      )
    }
    return NextResponse.json({ ok: true })
  }

  // ----- Order / checkout triggers -----------------------------------------
  const triggers = cfg.triggers ?? {}
  // Backwards-compat with 0.1 connections that just set originateOnCheckout
  if (
    !triggers['checkouts/create'] &&
    cfg.originateOnCheckout &&
    cfg.agentId &&
    topic === 'checkouts/create'
  ) {
    triggers['checkouts/create'] = { enabled: true, agentId: cfg.agentId }
  }

  const trigger = triggers[topic]
  if (!trigger?.enabled) {
    return NextResponse.json({ ok: true, ignored: topic })
  }

  const parsed = orderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: true, ignored: 'unparseable' })
  }
  const phone = pickPhone(parsed.data)
  const agentId = trigger.agentId || cfg.defaultAgentId || ''
  if (!phone || !agentId) {
    return NextResponse.json({ ok: true, originated: false, reason: 'missing_phone_or_agent' })
  }

  if (isQuietHours(cfg, new Date())) {
    return NextResponse.json({ ok: true, originated: false, reason: 'quiet_hours' })
  }

  const onDnc = await DncEntry.exists({ orgId: conn.orgId, e164: phone })
  if (onDnc) return NextResponse.json({ ok: true, originated: false, reason: 'dnc' })

  const metadata = {
    trigger: topic,
    source: 'shopify',
    order_id: String(parsed.data.id ?? ''),
    order_number: parsed.data.name ?? '',
    currency: parsed.data.currency ?? '',
    total: parsed.data.total_price ?? '',
    customer: pickCustomerName(parsed.data),
    items: lineItemsString(parsed.data),
  }

  try {
    const r = await voiceClient.originate({
      agentId,
      toE164: phone,
      fromE164: cfg.defaultFromE164 || undefined,
      tier: 'pipeline',
      metadata,
    })
    return NextResponse.json({ ok: true, originated: true, callId: r.callId })
  } catch (e) {
    return NextResponse.json({
      ok: true,
      originated: false,
      reason: 'voice_unreachable',
      message: (e as Error).message,
    })
  }
})
