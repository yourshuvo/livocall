export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Agent } from '@/models/Agent'
import { Call } from '@/models/Call'
import { DncEntry } from '@/models/DncEntry'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'
import { callToJson } from '@/lib/serialize'
import { voiceClient } from '@/lib/voice-client'
import { getOriginationGuard } from '@/lib/billing-caps'
import { resolveAgentTools } from '@/lib/secret-vault'

const OriginateBody = z.object({
  agent_id: z.string(),
  to_e164: z.string().regex(/^\+\d{8,15}$/),
  from_e164: z.string().regex(/^\+\d{8,15}$/).optional(),
  metadata: z.record(z.string()).optional(),
})

export const GET = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'calls:read')
  if (isResponse(auth)) return auth
  const url = new URL(req.url)
  const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 50))
  const filter: Record<string, unknown> = { orgId: auth.orgId }
  const outcome = url.searchParams.get('outcome')
  if (outcome) filter.outcome = outcome
  await connectMongo()
  const calls = await Call.find(filter).sort({ startedAt: -1 }).limit(limit).lean()
  return NextResponse.json({ data: calls.map(callToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'calls:write')
  if (isResponse(auth)) return auth
  const body = OriginateBody.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const [agent, guard, dnc] = await Promise.all([
    Agent.findOne({ _id: body.agent_id, orgId: auth.orgId }),
    getOriginationGuard(auth.orgId),
    DncEntry.findOne({ orgId: auth.orgId, e164: body.to_e164 }).lean(),
  ])
  if (!agent) return apiError('not_found', 'agent not found')
  if (!guard.ok) return apiError('forbidden', guard.reason)
  if (dnc) return apiError('forbidden', 'destination is on the org DNC list')
  const tools = await resolveAgentTools(auth.orgId, agent.tools || [])
  try {
    const r = await voiceClient.originate({
      agentId: String(agent._id),
      toE164: body.to_e164,
      fromE164: body.from_e164,
      tier: agent.tier,
      tools,
      metadata: body.metadata,
    })
    return NextResponse.json(r)
  } catch (e) {
    return apiError('upstream_error', e instanceof Error ? e.message : 'voice service error')
  }
})
