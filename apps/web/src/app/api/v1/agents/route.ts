export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Agent } from '@/models/Agent'
import { authV1, isResponse } from '@/lib/auth/v1'
import { withErrors } from '@/lib/errors'
import { agentToJson } from '@/lib/serialize'
import { agentLanguageCodes } from '@/types/agent'
import { OutcomeConfigSchema } from '@/lib/business-outcomes'

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
    geminiLiveVadSilenceMs: z.number().int().min(250).max(2000).optional(),
    geminiKbToolTimeoutMs: z.number().int().min(300).max(5000).optional(),
    geminiMemoryEnabled: z.boolean().optional(),
    geminiKbCacheEnabled: z.boolean().optional(),
  })
  .optional()

const Body = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().default(''),
  tier: z.enum(['gemini_live', 'grok_voice', 'pipeline', 'dtmf']).default('gemini_live'),
  model: z.string().max(120).optional().default(''),
  language: z.enum(agentLanguageCodes).default('bn-en-mixed'),
  voice: z
    .object({
      provider: z.string().max(64).optional().default('gemini-live'),
      voiceId: z.string().max(120).optional().default('aoede'),
      style: z.string().max(64).optional().default('conversational'),
    })
    .optional(),
  prompt: z
    .object({
      system: z.string().max(8000).optional().default(''),
      firstMessage: z.string().max(2000).optional().default(''),
      guardrails: z.string().max(4000).optional().default(''),
    })
    .optional(),
  postCallWebhook: z.string().max(500).optional().default(''),
  runtimeSettings: RuntimeSettings,
  outcomeConfig: OutcomeConfigSchema.optional(),
})

export const GET = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'agents:read')
  if (isResponse(auth)) return auth
  await connectMongo()
  const agents = await Agent.find({ orgId: auth.orgId }).sort({ updatedAt: -1 }).lean()
  return NextResponse.json({ data: agents.map(agentToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'agents:write')
  if (isResponse(auth)) return auth
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const created = await Agent.create({
    orgId: auth.orgId,
    ...body,
    voice: body.voice ?? { provider: 'gemini-live', voiceId: 'aoede', style: 'conversational' },
    prompt: body.prompt ?? { system: '', firstMessage: '', guardrails: '' },
    geminiMemory: {
      status: body.runtimeSettings?.geminiMemoryEnabled === false ? 'unsupported' : 'stale',
      text: '',
      sourceHash: '',
      updatedAt: new Date(),
    },
    status: 'draft',
  })
  return NextResponse.json(agentToJson(created.toObject()), { status: 201 })
})
