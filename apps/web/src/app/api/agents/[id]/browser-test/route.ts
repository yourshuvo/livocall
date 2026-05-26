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

  const wsBase = browserWsBaseUrl()
  if (!wsBase) {
    return apiError('upstream_error', 'browser voice test websocket is not configured')
  }

  const callId = new Types.ObjectId().toString()
  const wsUrl = new URL(wsBase)
  wsUrl.searchParams.set('call_id', callId)
  wsUrl.searchParams.set('agent_id', String(oid))
  wsUrl.searchParams.set('tier', agent.tier)
  wsUrl.searchParams.append('meta', 'source:dashboard-browser-test')
  const auth = signWsAuth(callId)
  if (auth) wsUrl.searchParams.set('auth', auth)

  return NextResponse.json({
    callId,
    wsUrl: wsUrl.toString(),
    inputSampleRate: 16000,
    outputSampleRate: agent.tier === 'grok_voice' || agent.tier === 'dtmf' ? 16000 : 24000,
  })
})

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
