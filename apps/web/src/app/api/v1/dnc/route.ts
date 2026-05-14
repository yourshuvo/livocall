export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { DncEntry } from '@/models/DncEntry'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'
import { dncToJson } from '@/lib/serialize'

const Body = z.object({
  e164: z.string().regex(/^\+\d{8,15}$/),
  reason: z.string().max(120).optional().default('api'),
  note: z.string().max(500).optional().default(''),
})

export const GET = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'dnc:read')
  if (isResponse(auth)) return auth
  await connectMongo()
  const rows = await DncEntry.find({ orgId: auth.orgId }).sort({ createdAt: -1 }).limit(500).lean()
  return NextResponse.json({ data: rows.map(dncToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'dnc:write')
  if (isResponse(auth)) return auth
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const existing = await DncEntry.findOne({ orgId: auth.orgId, e164: body.e164 }).lean()
  if (existing) return apiError('conflict', 'number already on DNC list')
  const created = await DncEntry.create({ orgId: auth.orgId, ...body })
  return NextResponse.json(dncToJson(created.toObject()))
})