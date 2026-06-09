export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectMongo } from '@/lib/db'
import {
  dashboardRateLimit,
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { browserIceServers, browserWebrtcUrl, signWsAuth } from '@/lib/browser-webrtc'
import { Agent } from '@/models/Agent'
import { Call } from '@/models/Call'

export const POST = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const session = await requireDashboardSession()
  if (isResponse(session)) return session
  const limit = await dashboardRateLimit(session.orgId, 'browser-test', 20)
  if (!limit.ok) return apiError('rate_limited', 'too many browser tests')

  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input', 'invalid agent id')

  await connectMongo()
  const agent = await Agent.findOne({ _id: oid, orgId: session.orgId }).lean<{
    tier: 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
  }>()
  if (!agent) return apiError('not_found', 'agent not found')

  const callId = new Types.ObjectId().toString()
  if (agent.tier !== 'gemini_live' && agent.tier !== 'pipeline') {
    return apiError('invalid_input', 'browser voice test currently supports Gemini Live and Pipeline agents only')
  }

  const webrtcUrl = browserWebrtcUrl()
  if (!webrtcUrl) {
    return apiError('upstream_error', 'browser WebRTC is not configured')
  }
  await createBrowserTestCall({
    callId,
    orgId: session.orgId,
    agentId: oid,
    tier: agent.tier,
  })
  webrtcUrl.searchParams.set('call_id', callId)
  webrtcUrl.searchParams.set('agent_id', String(oid))
  webrtcUrl.searchParams.set('tier', agent.tier)
  webrtcUrl.searchParams.append('meta', 'source:dashboard-browser-test')
  const auth = signWsAuth(callId)
  if (auth) webrtcUrl.searchParams.set('auth', auth)

  return NextResponse.json({
    callId,
    transport: 'small-webrtc',
    webrtcUrl: webrtcUrl.toString(),
    iceServers: browserIceServers(),
  })
})

async function createBrowserTestCall({
  callId,
  orgId,
  agentId,
  tier,
}: {
  callId: string
  orgId: string
  agentId: Types.ObjectId
  tier: 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
}) {
  const startedAt = new Date()
  await Call.create({
    _id: new Types.ObjectId(callId),
    orgId,
    agentId,
    direction: 'outbound',
    fromE164: 'browser-test',
    toE164: 'browser-test',
    tier,
    startedAt,
    outcome: 'in_progress',
    transcript: [],
    cost: {
      sttPaisa: 0,
      llmPaisa: 0,
      ttsPaisa: 0,
      sipPaisa: 0,
      totalPaisa: 0,
    },
    metadata: { source: 'dashboard-browser-test' },
    latency: { callCreatedAt: startedAt.toISOString() },
  })
}
