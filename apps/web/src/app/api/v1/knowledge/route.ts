export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import { authV1, isResponse } from '@/lib/auth/v1'
import { withErrors } from '@/lib/errors'
import { kbToJson } from '@/lib/serialize'

const Body = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
})

export const GET = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'knowledge:read')
  if (isResponse(auth)) return auth
  await connectMongo()
  const rows = await KnowledgeBase.find({ orgId: auth.orgId }).sort({ updatedAt: -1 }).lean()
  return NextResponse.json({ data: rows.map(kbToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'knowledge:write')
  if (isResponse(auth)) return auth
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const doc = await KnowledgeBase.create({
    orgId: auth.orgId,
    name: body.name,
    description: body.description ?? '',
    sources: [],
  })
  return NextResponse.json(kbToJson(doc.toObject()), { status: 201 })
})
