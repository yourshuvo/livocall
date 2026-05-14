export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Webhook, WEBHOOK_EVENTS } from '@/models/Webhook'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { webhookToJson } from '@/lib/serialize'
import { randomToken } from '@/lib/hmac'

const Body = z.object({
  url: z.string().url().max(1000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  description: z.string().max(400).optional().default(''),
  active: z.boolean().optional().default(true),
})

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const hooks = await Webhook.find({ orgId: s.orgId }).sort({ createdAt: -1 }).lean()
  return NextResponse.json({ webhooks: hooks.map((h) => webhookToJson(h)) })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const created = await Webhook.create({
    orgId: s.orgId,
    url: body.url,
    events: body.events,
    description: body.description,
    active: body.active,
    secret: randomToken('whsec_', 32),
  })
  await recordAudit(s, {
    action: 'webhook.create',
    resource: { type: 'Webhook', id: String(created._id) },
    meta: { url: body.url, events: body.events },
  })
  // Return secret on create only.
  return NextResponse.json(webhookToJson(created.toObject(), true))
})
