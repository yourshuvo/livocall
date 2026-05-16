export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import { signedReadUrl } from '@/lib/object-storage'

const Body = z.object({
  ref: z.string().min(1),
})

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input', 'invalid id')
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const kb = await KnowledgeBase.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!kb) return apiError('not_found')
  const source = (kb.sources || []).find((src) => src.ref === body.ref || src.storage?.key === body.ref)
  if (!source) return apiError('not_found', 'source not found')
  return NextResponse.json({ url: await signedReadUrl(source.storage?.key || source.ref) })
})