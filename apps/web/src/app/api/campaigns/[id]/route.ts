export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Campaign } from '@/models/Campaign'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { campaignToJson } from '@/lib/serialize'

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(400).optional(),
  concurrency: z.number().int().min(1).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  fromE164: z.string().regex(/^\+\d{8,15}$/).optional(),
  contactIds: z.array(z.string()).optional(),
})

export const GET = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const c = await Campaign.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!c) return apiError('not_found')
  return NextResponse.json(campaignToJson(c))
})

export const PATCH = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  const body = Patch.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const c = await Campaign.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $set: body },
    { new: true },
  ).lean()
  if (!c) return apiError('not_found')
  return NextResponse.json(campaignToJson(c))
})

export const DELETE = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const c = await Campaign.findOne({ _id: oid, orgId: s.orgId })
  if (!c) return apiError('not_found')
  if (c.status === 'running') return apiError('conflict', 'pause the campaign before deleting')
  await c.deleteOne()
  return NextResponse.json({ ok: true })
})
