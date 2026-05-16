export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Webhook, WEBHOOK_EVENTS } from '@/models/Webhook'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { webhookToJson } from '@/lib/serialize'

const Patch = z.object({
  url: z.string().url().max(1000).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  description: z.string().max(400).optional(),
  active: z.boolean().optional(),
})

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  const body = Patch.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const updated = await Webhook.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $set: body },
    { new: true },
  ).lean()
  if (!updated) return apiError('not_found')
  await recordAudit(s, {
    action: 'webhook.update',
    resource: { type: 'Webhook', id: String(oid) },
    meta: body,
  })
  return NextResponse.json(webhookToJson(updated))
})

export const DELETE = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const r = await Webhook.deleteOne({ _id: oid, orgId: s.orgId })
  if (r.deletedCount === 0) return apiError('not_found')
  await recordAudit(s, {
    action: 'webhook.delete',
    resource: { type: 'Webhook', id: String(oid) },
  })
  return NextResponse.json({ ok: true })
})
