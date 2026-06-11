export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Agent } from '@/models/Agent'
import { DncEntry } from '@/models/DncEntry'
import {
  dashboardRateLimit,
  isResponse,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { voiceClient } from '@/lib/voice-client'
import { resolveAgentTools } from '@/lib/secret-vault'
import { getOriginationGuard } from '@/lib/billing-caps'
import { normalizeBdPhoneToE164 } from '@/lib/phone-number'

const PhoneInput = z.preprocess(
  (value) => (typeof value === 'string' ? normalizeBdPhoneToE164(value) : value),
  z.string().regex(/^\+\d{8,15}$/),
)

const Body = z.object({
  agentId: z.string(),
  toE164: PhoneInput,
  fromE164: PhoneInput.optional(),
  metadata: z.record(z.string()).optional(),
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const limit = await dashboardRateLimit(s.orgId, 'originate')
  if (!limit.ok) return apiError('rate_limited')

  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()

  const [agent, guard, dnc] = await Promise.all([
    Agent.findOne({ _id: body.agentId, orgId: s.orgId }),
    getOriginationGuard(s.orgId),
    DncEntry.findOne({ orgId: s.orgId, e164: body.toE164 }).lean(),
  ])
  if (!agent) return apiError('not_found', 'agent not found')
  if (!guard.ok) return apiError('forbidden', guard.reason)
  if (dnc) return apiError('forbidden', 'destination is on the org DNC list')
  const tools = await resolveAgentTools(s.orgId, agent.tools || [])
  try {
    const r = await voiceClient.originate({
      agentId: String(agent._id),
      toE164: body.toE164,
      fromE164: body.fromE164,
      tier: agent.tier,
      tools,
      metadata: body.metadata,
    })
    return NextResponse.json(r)
  } catch (e) {
    return apiError('upstream_error', e instanceof Error ? e.message : 'voice service error')
  }
})
