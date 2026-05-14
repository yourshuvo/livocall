export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { kbToJson } from '@/lib/serialize'

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  embeddingNamespace: z.string().max(120).optional(),
})

export const GET = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const kb = await KnowledgeBase.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!kb) return apiError('not_found')
  return NextResponse.json(kbToJson(kb))
})

export const PATCH = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  const body = Patch.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const updated = await KnowledgeBase.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $set: body },
    { new: true },
  ).lean()
  if (!updated) return apiError('not_found')
  return NextResponse.json(kbToJson(updated))
})

export const DELETE = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const r = await KnowledgeBase.deleteOne({ _id: oid, orgId: s.orgId })
  if (r.deletedCount === 0) return apiError('not_found')
  return NextResponse.json({ ok: true })
})
