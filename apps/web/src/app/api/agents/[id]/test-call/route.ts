export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Agent } from '@/models/Agent'
import { DncEntry } from '@/models/DncEntry'
import {
  dashboardRateLimit,
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { voiceClient } from '@/lib/voice-client'
import { resolveAgentTools } from '@/lib/secret-vault'
import { getOriginationGuard } from '@/lib/billing-caps'

const Body = z.object({
  toE164: z.string().regex(/^\+\d{8,15}$/, 'must be E.164'),
  fromE164: z
    .string()
    .regex(/^\+\d{8,15}$/, 'must be E.164')
    .optional(),
})

export const POST = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const limit = await dashboardRateLimit(s.orgId, 'test-call')
  if (!limit.ok) return apiError('rate_limited', 'too many test calls')

  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input', 'invalid agent id')
  const body = Body.parse(await req.json().catch(() => ({})))

  await connectMongo()
  const agent = await Agent.findOne({ _id: oid, orgId: s.orgId })
  if (!agent) return apiError('not_found', 'agent not found')

  const dnc = await DncEntry.findOne({ orgId: s.orgId, e164: body.toE164 }).lean()
  if (dnc) return apiError('forbidden', 'destination is on the org DNC list')
  const guard = await getOriginationGuard(s.orgId)
  if (!guard.ok) return apiError('forbidden', guard.reason)
  const tools = await resolveAgentTools(s.orgId, agent.tools || [])

  try {
    const r = await voiceClient.originate({
      agentId: String(agent._id),
      toE164: body.toE164,
      fromE164: body.fromE164,
      tier: agent.tier,
      tools,
      metadata: { source: 'dashboard-test' },
    })
    return NextResponse.json(r)
  } catch (e) {
    return apiError('upstream_error', e instanceof Error ? e.message : 'voice service error')
  }
})
