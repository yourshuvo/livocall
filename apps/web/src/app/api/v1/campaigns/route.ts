export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Campaign } from '@/models/Campaign'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'
import { campaignToJson } from '@/lib/serialize'

const Body = z.object({
  name: z.string().min(1).max(200),
  agentId: z.string().min(1),
  concurrency: z.number().int().min(1).max(20).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  schedule: z
    .object({
      timezone: z.string().default('Asia/Dhaka'),
      windows: z
        .array(z.object({ from: z.number().int(), to: z.number().int() }))
        .optional(),
      startAt: z.string().optional(),
      endAt: z.string().optional(),
    })
    .optional(),
})

export const GET = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'campaigns:read')
  if (isResponse(auth)) return auth
  await connectMongo()
  const rows = await Campaign.find({ orgId: auth.orgId }).sort({ createdAt: -1 }).lean()
  return NextResponse.json({ data: rows.map(campaignToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'campaigns:write')
  if (isResponse(auth)) return auth
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const doc = await Campaign.create({
    orgId: auth.orgId,
    name: body.name,
    agentId: body.agentId,
    concurrency: body.concurrency ?? 1,
    maxAttempts: body.maxAttempts ?? 2,
    schedule: body.schedule ?? {},
    status: 'draft',
    contactIds: [],
  })
  if (!doc) return apiError('internal', 'failed to create campaign')
  return NextResponse.json(campaignToJson(doc.toObject()), { status: 201 })
})
