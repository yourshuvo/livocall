export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Campaign } from '@/models/Campaign'
import { Agent } from '@/models/Agent'
import { Contact } from '@/models/Contact'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { campaignToJson } from '@/lib/serialize'

const Body = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().default(''),
  agentId: z.string(),
  contactIds: z.array(z.string()).default([]),
  concurrency: z.number().int().min(1).max(100).default(1),
  maxAttempts: z.number().int().min(1).max(10).default(2),
  retryRules: z
    .object({
      noAnswerDelayMin: z.number().int().min(1).max(10080).default(60),
      busyDelayMin: z.number().int().min(1).max(10080).default(30),
      failedDelayMin: z.number().int().min(1).max(10080).default(240),
      voicemailRetry: z.boolean().default(true),
    })
    .optional(),
  leadScoring: z
    .object({
      enabled: z.boolean().default(false),
      minScore: z.number().min(0).max(100).default(0),
      scoreField: z.string().max(60).default('score'),
    })
    .optional(),
  autoStopGoals: z
    .object({
      completedCalls: z.number().int().min(0).max(1_000_000).default(0),
      conversionRatePct: z.number().min(0).max(100).default(0),
      maxSpendPaisa: z.number().int().min(0).default(0),
    })
    .optional(),
  fromE164: z
    .string()
    .regex(/^\+\d{8,15}$/)
    .optional()
    .default(''),
  schedule: z
    .object({
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
      timezone: z.string().max(64).default('Asia/Dhaka'),
      windows: z
        .array(z.object({ from: z.number().int().min(0).max(1440), to: z.number().int().min(0).max(1440) }))
        .default([{ from: 540, to: 1080 }]),
    })
    .default({ timezone: 'Asia/Dhaka', windows: [{ from: 540, to: 1080 }] }),
})

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const camps = await Campaign.find({ orgId: s.orgId }).sort({ updatedAt: -1 }).lean()
  return NextResponse.json({ campaigns: camps.map(campaignToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const agent = await Agent.findOne({ _id: body.agentId, orgId: s.orgId }).lean()
  if (!agent) return apiError('invalid_input', 'agent does not belong to this org')
  if (body.contactIds.length) {
    const cnt = await Contact.countDocuments({ _id: { $in: body.contactIds }, orgId: s.orgId })
    if (cnt !== body.contactIds.length) {
      return apiError('invalid_input', 'one or more contacts do not belong to this org')
    }
  }
  const created = await Campaign.create({
    orgId: s.orgId,
    ...body,
    schedule: {
      ...body.schedule,
      startAt: body.schedule.startAt ? new Date(body.schedule.startAt) : undefined,
      endAt: body.schedule.endAt ? new Date(body.schedule.endAt) : undefined,
    },
    stats: { total: body.contactIds.length, attempted: 0, completed: 0, failed: 0, noAnswer: 0 },
  })
  return NextResponse.json(campaignToJson(created.toObject()))
})
