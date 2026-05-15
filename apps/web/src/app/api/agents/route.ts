export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Agent } from '@/models/Agent'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import { recordAudit } from '@/lib/audit'
import { hasRole } from '@/lib/rbac'
import { agentLanguageCodes } from '@/types/agent'
import { OutcomeConfigSchema } from '@/lib/business-outcomes'

const ObjectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/)

const RuntimeSettings = z
  .object({
    welcomeMode: z.enum(['ai', 'caller', 'silent']).optional(),
    welcomeKind: z.enum(['dynamic', 'static']).optional(),
    pauseBeforeSpeakingSec: z.number().min(0).max(30).optional(),
    denoiseMode: z.enum(['none', 'mixed', 'off']).optional(),
    transcriptionMode: z.enum(['speed', 'accuracy', 'custom']).optional(),
    vocabularyMode: z.enum(['general', 'medical']).optional(),
    boostedKeywords: z.string().max(1000).optional(),
    voicemailDetection: z.boolean().optional(),
    ivrHangup: z.boolean().optional(),
    keypadInput: z.boolean().optional(),
    keypadTimeoutSec: z.number().min(0.5).max(10).optional(),
    terminationKey: z.boolean().optional(),
    digitLimit: z.boolean().optional(),
    endSilenceMin: z.number().min(1).max(60).optional(),
    maxDurationHours: z.number().min(0.25).max(4).optional(),
    handoffTarget: z.string().max(240).optional(),
    handoffRules: z.string().max(2000).optional(),
  })
  .optional()
  .default({})

const Body = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().default(''),
  tier: z.enum(['gemini_live', 'grok_voice', 'pipeline', 'dtmf']),
  model: z.string().max(120).optional().default(''),
  language: z.enum(agentLanguageCodes).default('bn-en-mixed'),
  voice: z
    .object({
      provider: z.string().max(64).optional().default('cartesia'),
      voiceId: z.string().max(120).optional().default(''),
      style: z.string().max(64).optional().default('conversational'),
    })
    .optional()
    .default({ provider: 'cartesia', voiceId: '', style: 'conversational' }),
  prompt: z
    .object({
      system: z.string().max(8000).optional().default(''),
      firstMessage: z.string().max(2000).optional().default(''),
      guardrails: z.string().max(4000).optional().default(''),
    })
    .default({ system: '', firstMessage: '', guardrails: '' }),
  dtmf: z
    .object({
      menu: z
        .array(
          z.object({
            key: z.string().max(8),
            label: z.string().max(120).optional().default(''),
            action: z.string().max(240).optional().default(''),
          }),
        )
        .max(20)
        .optional()
        .default([]),
      maxAttempts: z.number().int().min(1).max(10).optional().default(3),
      interDigitTimeoutMs: z.number().int().min(250).max(15000).optional().default(2500),
      terminator: z.string().max(2).optional().default('#'),
      noInputPromptUrl: z.string().max(500).optional().default(''),
    })
    .optional(),
  knowledgeBaseIds: z.array(ObjectIdString).max(20).optional().default([]),
  postCallWebhook: z.string().max(500).optional().default(''),
  runtimeSettings: RuntimeSettings,
  outcomeConfig: OutcomeConfigSchema.optional(),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!hasRole({ role: session.role }, 'admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  await connectMongo()
  const knowledgeBaseIds = [...new Set(parsed.data.knowledgeBaseIds)]
  if (knowledgeBaseIds.length) {
    const ownedCount = await KnowledgeBase.countDocuments({
      _id: { $in: knowledgeBaseIds },
      orgId: session.orgId,
    })
    if (ownedCount !== knowledgeBaseIds.length) {
      return NextResponse.json({ error: 'Invalid knowledge base' }, { status: 400 })
    }
  }
  const created = await Agent.create({
    orgId: session.orgId,
    ...parsed.data,
    knowledgeBaseIds,
    status: 'draft',
  })
  await recordAudit(
    {
      userId: String(session.userId),
      orgId: String(session.orgId),
      email: session.email,
      role: session.role,
    },
    {
      action: 'agent.create',
      resource: { type: 'Agent', id: String(created._id) },
      meta: { name: parsed.data.name, tier: parsed.data.tier },
    },
  )
  return NextResponse.json({ id: String(created._id) })
}

export async function GET() {
  const session = await getSession()
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  await connectMongo()
  const agents = await Agent.find({ orgId: session.orgId }).sort({ updatedAt: -1 }).lean()
  return NextResponse.json({
    agents: agents.map((a) => ({
      id: String(a._id),
      name: a.name,
      tier: a.tier,
      language: a.language,
      status: a.status,
    })),
  })
}
