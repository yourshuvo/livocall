export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Connection } from '@/models/Connection'
import { ApiKey } from '@/models/ApiKey'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  siteUrl: z.string().max(500).optional(),
  config: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
})

export const GET = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const c = await Connection.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!c) return apiError('not_found')
  return NextResponse.json({
    id: String(c._id),
    platform: c.platform,
    name: c.name,
    siteUrl: c.siteUrl,
    apiKeyId: String(c.apiKeyId),
    config: c.config,
    active: c.active,
    lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  })
})

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  if (s.role !== 'owner' && s.role !== 'admin') return apiError('forbidden')
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  const body = Patch.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const c = await Connection.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $set: body },
    { new: true },
  ).lean()
  if (!c) return apiError('not_found')
  return NextResponse.json({ id: String(c._id), active: c.active, name: c.name })
})

export const DELETE = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  if (s.role !== 'owner' && s.role !== 'admin') return apiError('forbidden')
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const c = await Connection.findOne({ _id: oid, orgId: s.orgId })
  if (!c) return apiError('not_found')
  // Revoke the linked API key, then delete the connection.
  await ApiKey.updateOne(
    { _id: c.apiKeyId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
  await c.deleteOne()
  return NextResponse.json({ ok: true })
})
