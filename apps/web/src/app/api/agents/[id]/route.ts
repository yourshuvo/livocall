export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Agent } from '@/models/Agent'
import { AgentVersion } from '@/models/AgentVersion'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { agentToJson } from '@/lib/serialize'
import { emitWebhook } from '@/lib/webhooks'
import { Secret } from '@/models/Secret'
import { agentLanguageCodes } from '@/types/agent'

const ObjectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/)

const RuntimeSettings = z.object({
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

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(400).optional(),
  tier: z.enum(['gemini_live', 'grok_voice', 'pipeline', 'dtmf']).optional(),
  model: z.string().max(120).optional(),
  language: z.enum(agentLanguageCodes).optional(),
  voice: z
    .object({
      provider: z.string().max(64).optional(),
      voiceId: z.string().max(120).optional(),
      style: z.string().max(64).optional(),
    })
    .optional(),
  prompt: z
    .object({
      system: z.string().max(8000).optional(),
      firstMessage: z.string().max(2000).optional(),
      guardrails: z.string().max(4000).optional(),
    })
    .optional(),
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
        .optional(),
      maxAttempts: z.number().int().min(1).max(10).optional(),
      interDigitTimeoutMs: z.number().int().min(250).max(15000).optional(),
      terminator: z.string().max(2).optional(),
      noInputPromptUrl: z.string().max(500).optional(),
    })
    .optional(),
  postCallWebhook: z.string().max(500).optional(),
  tools: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
        description: z.string().max(400).optional().default(''),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
        url: z.string().url().max(800),
        headers: z.record(z.string()).optional().default({}),
        authHeader: z.string().max(120).optional().default(''),
        authValue: z.string().max(1000).optional().default(''),
        secretId: z.string().optional().nullable(),
        authValueSet: z.boolean().optional().default(false),
        allowedDomains: z.array(z.string().max(255)).max(20).optional().default([]),
        retries: z.number().int().min(1).max(3).default(1),
        timeoutMs: z.number().int().min(500).max(30000).default(5000),
        enabled: z.boolean().default(true),
      }),
    )
    .max(20)
    .optional(),
  status: z.enum(['draft', 'live']).optional(),
  knowledgeBaseIds: z.array(ObjectIdString).max(20).optional(),
  runtimeSettings: RuntimeSettings.optional(),
})

export const GET = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input', 'invalid id')
  await connectMongo()
  const agent = await Agent.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!agent) return apiError('not_found')
  return NextResponse.json(agentToJson(agent))
})

export const PATCH = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input', 'invalid id')
  const body = Patch.parse(await req.json().catch(() => ({})))
  await connectMongo()
  if (body.tools) {
    const secretIds = body.tools.map((tool) => tool.secretId).filter((id): id is string => Boolean(id))
    if (secretIds.length) {
      const count = await Secret.countDocuments({ _id: { $in: secretIds }, orgId: s.orgId, revokedAt: { $exists: false } })
      if (count !== secretIds.length) return apiError('invalid_input', 'one or more tool secrets are unavailable')
    }
    body.tools = body.tools.map((tool) => {
      const secretId = tool.secretId || undefined
      return {
        ...tool,
        secretId,
        authValueSet: Boolean(secretId || tool.authValue || tool.authValueSet),
        authValue: secretId ? '' : tool.authValue || '',
      }
    })
  }
  if (body.knowledgeBaseIds?.length) {
    const knowledgeBaseIds = [...new Set(body.knowledgeBaseIds)]
    const count = await KnowledgeBase.countDocuments({ _id: { $in: knowledgeBaseIds }, orgId: s.orgId })
    if (count !== knowledgeBaseIds.length) return apiError('invalid_input', 'one or more knowledge bases are unavailable')
    body.knowledgeBaseIds = knowledgeBaseIds
  }
  const existing = await Agent.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!existing) return apiError('not_found')
  await AgentVersion.create({
    orgId: s.orgId,
    agentId: oid,
    createdBy: s.userId,
    label: 'Before update',
    snapshot: agentToJson(existing),
  })
  const agent = await Agent.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $set: body },
    { new: true },
  ).lean()
  if (!agent) return apiError('not_found')
  emitWebhook(s.orgId, 'agent.updated', { agentId: String(agent._id) }).catch(() => {})
  await recordAudit(s, {
    action: 'agent.update',
    resource: { type: 'Agent', id: String(agent._id) },
    meta: { changedKeys: Object.keys(body) },
  })
  return NextResponse.json(agentToJson(agent))
})

export const DELETE = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input', 'invalid id')
  await connectMongo()
  const r = await Agent.deleteOne({ _id: oid, orgId: s.orgId })
  if (r.deletedCount === 0) return apiError('not_found')
  await recordAudit(s, {
    action: 'agent.delete',
    resource: { type: 'Agent', id: String(oid) },
  })
  return NextResponse.json({ ok: true })
})
