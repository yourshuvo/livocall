export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { kbToJson } from '@/lib/serialize'
import { calculateKnowledgeQuality } from '@/lib/knowledge-quality'

const Body = z.object({
  name: z.string().min(1).max(120),
  embeddingNamespace: z.string().max(120).optional().default(''),
})

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const kbs = await KnowledgeBase.find({ orgId: s.orgId }).sort({ createdAt: -1 }).lean()
  return NextResponse.json({ knowledgeBases: kbs.map(kbToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const created = await KnowledgeBase.create({
    orgId: s.orgId,
    ...body,
    quality: calculateKnowledgeQuality({ sources: [] }),
  })
  return NextResponse.json(kbToJson(created.toObject()))
})
