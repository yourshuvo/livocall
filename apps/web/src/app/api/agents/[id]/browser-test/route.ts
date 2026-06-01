export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createHmac } from 'node:crypto'
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
  if (agent.tier === 'gemini_live') {
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
  }

  const wsBase = browserWsBaseUrl()
  if (!wsBase) {
    return apiError('upstream_error', 'browser voice test websocket is not configured')
  }
  const wsUrl = new URL(wsBase)
  wsUrl.searchParams.set('call_id', callId)
  wsUrl.searchParams.set('agent_id', String(oid))
  wsUrl.searchParams.set('tier', agent.tier)
  wsUrl.searchParams.append('meta', 'source:dashboard-browser-test')
  const auth = signWsAuth(callId)
  if (auth) wsUrl.searchParams.set('auth', auth)

  return NextResponse.json({
    callId,
    transport: 'raw-websocket',
    wsUrl: wsUrl.toString(),
    inputSampleRate: 16000,
    outputSampleRate: agent.tier === 'grok_voice' || agent.tier === 'dtmf' ? 16000 : 24000,
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

type IceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

function browserWebrtcUrl() {
  const direct = process.env.VOICE_BROWSER_WEBRTC_URL || ''
  const serviceUrl = process.env.NEXT_PUBLIC_VOICE_SERVICE_URL || process.env.VOICE_SERVICE_URL || ''
  const value = direct || (serviceUrl ? `${serviceUrl.replace(/\/+$/, '')}/webrtc/browser-offer` : '')
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (!/^https?:$/.test(url.protocol)) return null
    return url
  } catch {
    return null
  }
}

function browserIceServers(): IceServer[] {
  const servers: IceServer[] = (process.env.WEBRTC_ICE_SERVERS || 'stun:stun.l.google.com:19302')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({ urls: url }))
  const turnUrl = process.env.WEBRTC_TURN_URL || ''
  if (turnUrl) {
    const turn: IceServer = { urls: turnUrl }
    if (process.env.WEBRTC_TURN_USERNAME) turn.username = process.env.WEBRTC_TURN_USERNAME
    if (process.env.WEBRTC_TURN_CREDENTIAL) turn.credential = process.env.WEBRTC_TURN_CREDENTIAL
    servers.push(turn)
  }
  return servers
}

function browserWsBaseUrl() {
  const direct =
    process.env.VOICE_BROWSER_WS_URL ||
    process.env.NEXT_PUBLIC_VOICE_WS_URL ||
    process.env.VOICE_WS_PUBLIC_URL ||
    ''
  if (direct) return normalizeWsUrl(direct)

  const serviceUrl = process.env.NEXT_PUBLIC_VOICE_SERVICE_URL || process.env.VOICE_SERVICE_URL || ''
  if (!serviceUrl) return ''
  return normalizeWsUrl(`${serviceUrl.replace(/\/+$/, '')}/ws/audio`)
}

function normalizeWsUrl(value: string) {
  const normalized = value.trim().replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')
  if (!normalized) return ''
  try {
    const url = new URL(normalized)
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/ws/audio'
    } else if (url.pathname.endsWith('/ws/audio-pcmu')) {
      url.pathname = url.pathname.replace(/\/ws\/audio-pcmu$/, '/ws/audio')
    }
    return url.toString()
  } catch {
    return ''
  }
}

function signWsAuth(callId: string) {
  const secret = process.env.VOICE_WS_SHARED_SECRET || ''
  if (!secret) return ''
  const ttl = Number(process.env.VOICE_WS_AUTH_TTL_SECONDS || 3600)
  const expires = Math.floor(Date.now() / 1000) + Math.max(60, ttl)
  const signature = createHmac('sha256', secret)
    .update(`${callId}|${expires}`)
    .digest('base64url')
  return `${expires}.${signature}`
}
