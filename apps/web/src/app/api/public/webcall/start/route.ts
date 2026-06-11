export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createHmac, randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import { browserIceServers, browserWebrtcUrl, signWsAuth } from '@/lib/browser-webrtc'
import { signPublicRecordingToken } from '@/lib/public-recording-token'
import { rateLimit } from '@/lib/rate-limit'
import { Agent } from '@/models/Agent'
import { Call } from '@/models/Call'
import { Org } from '@/models/Org'

const SESSION_COOKIE = 'livocall_public_webcall_id'
const PUBLIC_SOURCE = 'landing-webcall'
const GEMINI_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview'
const DEFAULT_MAX_DURATION_SEC = 240
const MIN_MAX_DURATION_SEC = 15
const HARD_MAX_DURATION_SEC = 240
const ACTIVE_WINDOW_MS = 90_000
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000
const BUILTIN_AGENT_NAME = 'LivoCall Built-in Webcall Demo'
const BUILTIN_AGENT_DESCRIPTION =
  'Safe built-in public landing Webcall demo. Auto-created by LivoCall when PUBLIC_WEBCALL_AGENT_ID is not set.'

export const POST = withErrors(async (req: Request) => {
  const cookieStore = await cookies()
  const existingSessionId = cookieStore.get(SESSION_COOKIE)?.value || ''
  const sessionId = isPublicSessionId(existingSessionId) ? existingSessionId : randomUUID()
  const shouldSetCookie = sessionId !== existingSessionId
  const ipHash = hashPublicIdentifier(clientIp(req))
  const sessionHash = hashPublicIdentifier(sessionId)
  const rateLimitedResponse = await checkFastRateLimits(ipHash, sessionHash)
  if (rateLimitedResponse) return withPublicSessionCookie(rateLimitedResponse, sessionId, shouldSetCookie)

  const webrtcUrl = browserWebrtcUrl()
  if (!webrtcUrl) {
    return withPublicSessionCookie(
      apiError('upstream_error', 'browser WebRTC is not configured'),
      sessionId,
      shouldSetCookie,
    )
  }

  await connectMongo()
  const agent = await resolvePublicWebcallAgent()
  if (!agent) {
    return withPublicSessionCookie(
      apiError('upstream_error', 'public Webcall needs at least one organization'),
      sessionId,
      shouldSetCookie,
    )
  }
  if ((agent.tier !== 'gemini_live' && agent.tier !== 'pipeline') || agent.status !== 'live') {
    return withPublicSessionCookie(
      apiError('upstream_error', 'public Webcall agent is not available'),
      sessionId,
      shouldSetCookie,
    )
  }
  const agentId = agent._id
  const agentTier = agent.tier

  const dbLimitResponse = await checkPersistentLimits(ipHash, sessionHash)
  if (dbLimitResponse) return withPublicSessionCookie(dbLimitResponse, sessionId, shouldSetCookie)

  const maxDurationSec = publicMaxDurationSec()
  const expiresAt = new Date(Date.now() + maxDurationSec * 1000)
  const callObjectId = new Types.ObjectId()
  const callId = callObjectId.toString()
  const startedAt = new Date()

  await Call.create({
    _id: callObjectId,
    orgId: agent.orgId,
    agentId,
    direction: 'outbound',
    fromE164: 'public-webcall',
    toE164: 'public-webcall',
    tier: agentTier,
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
    metadata: {
      source: PUBLIC_SOURCE,
      publicDemo: true,
      retention: 'short',
      publicIpHash: ipHash,
      publicSessionHash: sessionHash,
      maxDurationSec,
      model: agentTier === 'gemini_live' ? GEMINI_LIVE_MODEL : String(agent.model || ''),
      language: agentTier === 'gemini_live' ? 'bn' : String(agent.language || 'bn-en-mixed'),
      builtInAgent: String(agent.name || '') === BUILTIN_AGENT_NAME,
    },
    latency: { callCreatedAt: startedAt.toISOString() },
  })

  webrtcUrl.searchParams.set('call_id', callId)
  webrtcUrl.searchParams.set('agent_id', String(agentId))
  webrtcUrl.searchParams.set('tier', agentTier)
  webrtcUrl.searchParams.append('meta', `source:${PUBLIC_SOURCE}`)
  webrtcUrl.searchParams.append('meta', 'publicDemo:true')
  webrtcUrl.searchParams.append('meta', `maxDurationSec:${maxDurationSec}`)
  if (agentTier === 'gemini_live') {
    webrtcUrl.searchParams.append('meta', `model:${GEMINI_LIVE_MODEL}`)
    webrtcUrl.searchParams.append('meta', 'language:bn')
  }
  webrtcUrl.searchParams.append('meta', 'banglaOnly:true')
  const auth = signWsAuth(callId)
  if (auth) webrtcUrl.searchParams.set('auth', auth)
  const recordingUploadToken = signPublicRecordingToken(
    callId,
    process.env.VOICE_WS_SHARED_SECRET || '',
    maxDurationSec + 600,
  )

  return withPublicSessionCookie(
    NextResponse.json({
      callId,
      transport: 'small-webrtc',
      webrtcUrl: webrtcUrl.toString(),
      iceServers: browserIceServers(),
      maxDurationSec,
      expiresAt: expiresAt.toISOString(),
      recordingUploadToken,
    }),
    sessionId,
    shouldSetCookie,
  )
})

async function resolvePublicWebcallAgent(): Promise<{
  _id: Types.ObjectId
  orgId: Types.ObjectId
  name: string
  tier: 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
  model?: string
  language?: string
  status: 'draft' | 'live'
} | null> {
  const rawAgentId = (process.env.PUBLIC_WEBCALL_AGENT_ID || '').trim()
  if (Types.ObjectId.isValid(rawAgentId)) {
    return Agent.findOne({ _id: new Types.ObjectId(rawAgentId), status: 'live' }).lean<{
      _id: Types.ObjectId
      orgId: Types.ObjectId
      name: string
      tier: 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
      model?: string
      language?: string
      status: 'draft' | 'live'
    }>()
  }

  const org = await resolvePublicWebcallOrg()
  if (!org) return null
  const existing = await Agent.findOne({
    orgId: org._id,
    name: BUILTIN_AGENT_NAME,
    tier: 'gemini_live',
  }).lean<{
    _id: Types.ObjectId
    orgId: Types.ObjectId
    name: string
    tier: 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
    status: 'draft' | 'live'
  }>()
  if (existing) {
    if (existing.status !== 'live') {
      await Agent.updateOne({ _id: existing._id }, { $set: builtInPublicAgentPatch() })
      return { ...existing, status: 'live' }
    }
    return existing
  }

  const created = await Agent.create({
    orgId: org._id,
    name: BUILTIN_AGENT_NAME,
    tier: 'gemini_live',
    ...builtInPublicAgentPatch(),
  })
  return {
    _id: created._id,
    orgId: created.orgId,
    name: created.name,
    tier: created.tier,
    status: created.status,
  }
}

async function resolvePublicWebcallOrg() {
  const rawOrgId = (process.env.PUBLIC_WEBCALL_ORG_ID || '').trim()
  if (Types.ObjectId.isValid(rawOrgId)) {
    const org = await Org.findById(rawOrgId).lean<{ _id: Types.ObjectId }>()
    if (org) return org
  }
  return Org.findOne({}).sort({ createdAt: 1 }).lean<{ _id: Types.ObjectId }>()
}

function builtInPublicAgentPatch() {
  return {
    description: BUILTIN_AGENT_DESCRIPTION,
    status: 'live' as const,
    model: GEMINI_LIVE_MODEL,
    language: 'bn' as const,
    voice: { provider: 'gemini-live', voiceId: 'Puck', style: 'conversational' },
    prompt: {
      system:
        'আপনি LivoCall-এর পাবলিক Webcall ডেমো এজেন্ট। সবসময় বাংলায় কথা বলুন। ' +
        'খুব সংক্ষিপ্ত, বন্ধুত্বপূর্ণ এবং নিরাপদ উত্তর দিন। ব্যক্তিগত তথ্য চাইবেন না। ' +
        'ব্যবহারকারী যদি LivoCall সম্পর্কে জিজ্ঞেস করে, নিচের Gemini memory থেকে উত্তর দিন।',
      firstMessage: 'হ্যালো, আমি LivoCall-এর বাংলা AI Webcall ডেমো। কীভাবে সাহায্য করতে পারি?',
      guardrails:
        'শুধু পাবলিক ডেমো তথ্য ব্যবহার করুন। দাম, চুক্তি, মেডিকেল, আইন, বা ব্যক্তিগত পরামর্শ দেবেন না। দরকার হলে বলুন টিমের সাথে কথা বলতে হবে।',
    },
    runtimeSettings: {
      welcomeMode: 'ai' as const,
      welcomeKind: 'static' as const,
      geminiLiveVadSilenceMs: 250,
      geminiKbToolTimeoutMs: 1200,
      geminiMemoryEnabled: true,
      geminiKbCacheEnabled: false,
      handoffTarget: '',
      handoffRules: '',
    },
    geminiMemory: {
      status: 'ready' as const,
      text: [
        '- LivoCall হলো Bangla-first AI voice/webcall platform for customer calls.',
        '- এই ডেমোটি Gemini 3.1 Flash Live দিয়ে চলে।',
        '- Public demo সর্বোচ্চ 4 minutes চলে এবং billing হয় না।',
        '- LivoCall appointment, customer support, lead qualification, survey, and order confirmation use cases support করে।',
        '- Company location context: Kurigram.',
      ].join('\n'),
      sourceHash: 'built-in-public-webcall-v1',
      updatedAt: new Date(),
    },
    knowledgeBaseIds: [],
    postCallWebhook: '',
  }
}

async function checkFastRateLimits(ipHash: string, sessionHash: string) {
  const [ipLimit, sessionLimit] = await Promise.all([
    rateLimit({
      key: `public-webcall:ip:${ipHash}`,
      capacity: 2,
      refillPerSec: 1 / (15 * 60),
    }),
    rateLimit({
      key: `public-webcall:session:${sessionHash}`,
      capacity: 3,
      refillPerSec: 1 / (30 * 60),
    }),
  ])
  if (ipLimit.ok && sessionLimit.ok) return null
  return apiError('rate_limited', 'Webcall demo limit reached. Please try again later.', {
    retryAt: new Date(Math.max(ipLimit.resetAt, sessionLimit.resetAt)).toISOString(),
  })
}

async function checkPersistentLimits(ipHash: string, sessionHash: string) {
  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS)
  const active = await Call.exists({
    outcome: 'in_progress',
    startedAt: { $gte: activeSince },
    'metadata.source': PUBLIC_SOURCE,
    $or: [{ 'metadata.publicIpHash': ipHash }, { 'metadata.publicSessionHash': sessionHash }],
  })
  if (active) {
    return apiError('rate_limited', 'A Webcall demo is already active. Please stop it first.')
  }

  const dailySince = new Date(Date.now() - DAILY_WINDOW_MS)
  const [sessionDaily, ipDaily] = await Promise.all([
    Call.countDocuments({
      startedAt: { $gte: dailySince },
      'metadata.source': PUBLIC_SOURCE,
      'metadata.publicSessionHash': sessionHash,
    }),
    Call.countDocuments({
      startedAt: { $gte: dailySince },
      'metadata.source': PUBLIC_SOURCE,
      'metadata.publicIpHash': ipHash,
    }),
  ])
  if (sessionDaily >= 5 || ipDaily >= 10) {
    return apiError('rate_limited', 'Daily Webcall demo limit reached. Please try again tomorrow.')
  }
  return null
}

function withPublicSessionCookie(response: NextResponse, sessionId: string, shouldSetCookie: boolean) {
  if (!shouldSetCookie) return response
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return response
}

function clientIp(req: Request) {
  const cf = req.headers.get('cf-connecting-ip') || ''
  if (cf.trim()) return cf.trim()
  const real = req.headers.get('x-real-ip') || ''
  if (real.trim()) return real.trim()
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const firstForwarded = forwarded.split(',')[0]?.trim()
  return firstForwarded || 'unknown'
}

function hashPublicIdentifier(value: string) {
  return createHmac('sha256', hashSecret()).update(value).digest('hex')
}

function hashSecret() {
  return (
    process.env.PUBLIC_WEBCALL_HASH_SECRET ||
    process.env.WEB_SHARED_SECRET ||
    process.env.VOICE_SHARED_SECRET ||
    'livocall-public-webcall-dev'
  )
}

function isPublicSessionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function publicMaxDurationSec() {
  const raw = Number(process.env.PUBLIC_WEBCALL_MAX_DURATION_SEC || DEFAULT_MAX_DURATION_SEC)
  const parsed = Number.isFinite(raw) ? Math.round(raw) : DEFAULT_MAX_DURATION_SEC
  return Math.min(HARD_MAX_DURATION_SEC, Math.max(MIN_MAX_DURATION_SEC, parsed))
}
