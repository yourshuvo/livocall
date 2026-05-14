export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { DncEntry, DNC_REASONS } from '@/models/DncEntry'
import {
  isResponse,
  parsePagination,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { dncToJson } from '@/lib/serialize'

const Body = z.object({
  e164: z.string().regex(/^\+\d{8,15}$/),
  reason: z.enum(DNC_REASONS).optional().default('user_request'),
  note: z.string().max(400).optional().default(''),
})

export const GET = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const { limit } = parsePagination(new URL(req.url), 200, 2000)
  await connectMongo()
  const entries = await DncEntry.find({ orgId: s.orgId }).sort({ createdAt: -1 }).limit(limit).lean()
  return NextResponse.json({ entries: entries.map(dncToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const exists = await DncEntry.findOne({ orgId: s.orgId, e164: body.e164 }).lean()
  if (exists) return NextResponse.json(dncToJson(exists))
  const created = await DncEntry.create({ orgId: s.orgId, ...body })
  return NextResponse.json(dncToJson(created.toObject()))
})

export const DELETE = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const url = new URL(req.url)
  const e164 = url.searchParams.get('e164')
  if (!e164) return apiError('invalid_input', 'pass ?e164=…')
  await connectMongo()
  const r = await DncEntry.deleteOne({ orgId: s.orgId, e164 })
  if (r.deletedCount === 0) return apiError('not_found')
  return NextResponse.json({ ok: true })
})
