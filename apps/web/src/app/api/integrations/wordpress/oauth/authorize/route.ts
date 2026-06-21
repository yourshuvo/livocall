export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { randomToken } from '@/lib/hmac'
import {
  createWordPressOAuthCode,
  hashWordPressOAuthCode,
  validateWordPressOAuthRedirect,
  withWordPressConfig,
  wordpressOAuthExpiresAt,
} from '@/lib/wordpress-integration'
import { Agent } from '@/models/Agent'
import { ApiKey } from '@/models/ApiKey'
import { Connection } from '@/models/Connection'
import { PhoneNumber } from '@/models/PhoneNumber'
import { WordPressOAuthGrant } from '@/models/WordPressOAuthGrant'

const WORDPRESS_TRIGGER_IDS = [
  'order.processing',
  'order.failed',
  'cf7.submission',
  'wpforms.submission',
  'gravity_forms.submission',
] as const

const Body = z.object({
  state: z.string().min(16).max(240),
  callbackUrl: z.string().url().max(800),
  siteUrl: z.string().url().max(800),
  siteName: z.string().max(200).optional().default(''),
  pluginVersion: z.string().max(40).optional().default(''),
  codeChallenge: z.string().min(32).max(200),
  codeChallengeMethod: z.literal('S256').optional().default('S256'),
  connectionName: z.string().min(1).max(120),
  defaultAgentId: z.string().min(1).max(80),
  defaultFromE164: z.string().max(40).optional().default(''),
  triggers: z.array(z.string()).optional().default(['order.processing']),
})

async function parseBody(req: Request) {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return { value: await req.json().catch(() => ({})), wantsJson: true }
  }
  const form = await req.formData()
  return {
    value: {
      ...Object.fromEntries(form),
      triggers: form.getAll('triggers').map(String),
    },
    wantsJson: false,
  }
}

export const POST = withErrors(async (req: Request) => {
  const session = await requireDashboardSession()
  if (isResponse(session)) return session
  if (session.role !== 'owner' && session.role !== 'admin') return apiError('forbidden')
  const parsed = await parseBody(req)
  const body = Body.parse(parsed.value)
  const redirectCheck = validateWordPressOAuthRedirect({
    siteUrl: body.siteUrl,
    callbackUrl: body.callbackUrl,
  })
  if (!redirectCheck.ok) return apiError('invalid_input', redirectCheck.error)

  await connectMongo()
  const agent = await Agent.findOne({
    _id: body.defaultAgentId,
    orgId: session.orgId,
  }).lean()
  if (!agent) return apiError('not_found', 'default agent not found')
  if (body.defaultFromE164) {
    const phone = await PhoneNumber.findOne({
      orgId: session.orgId,
      e164: body.defaultFromE164,
      outboundEnabled: true,
      status: 'active',
    }).lean()
    if (!phone) return apiError('not_found', 'outbound number not found')
  }

  const plaintext = randomToken('lvo_word_', 24)
  const hash = await bcrypt.hash(plaintext, 10)
  const apiKey = await ApiKey.create({
    orgId: session.orgId,
    name: `${body.connectionName} (wordpress oauth)`,
    prefix: plaintext.slice(0, 16),
    hash,
    scopes: ['calls:read', 'calls:write', 'agents:read', 'contacts:read', 'contacts:write', 'dnc:read', 'dnc:write'],
    createdBy: session.userId,
  })
  const selectedTriggers = new Set(body.triggers)
  const triggers = Object.fromEntries(
    WORDPRESS_TRIGGER_IDS.map((trigger) => [trigger, { enabled: selectedTriggers.has(trigger) }]),
  )
  const now = new Date().toISOString()
  const config = withWordPressConfig(
    {
      defaultAgentId: body.defaultAgentId,
      defaultFromE164: body.defaultFromE164,
      timezone: 'Asia/Dhaka',
      triggers,
    },
    {
      oauthStartedAt: now,
      connectionMode: 'oauth',
      siteName: body.siteName,
      pluginVersion: body.pluginVersion,
    },
  )
  const connection = await Connection.create({
    orgId: session.orgId,
    platform: 'wordpress',
    name: body.connectionName,
    siteUrl: redirectCheck.site.href,
    apiKeyId: apiKey._id,
    config,
    createdBy: session.userId,
    lastSyncStatus: 'oauth_pending',
  })
  const code = createWordPressOAuthCode()
  await WordPressOAuthGrant.create({
    orgId: session.orgId,
    userId: session.userId,
    connectionId: connection._id,
    codeHash: hashWordPressOAuthCode(code),
    codeChallenge: body.codeChallenge,
    codeChallengeMethod: body.codeChallengeMethod,
    state: body.state,
    callbackUrl: redirectCheck.callback.href,
    siteUrl: redirectCheck.site.href,
    siteName: body.siteName,
    pluginVersion: body.pluginVersion,
    expiresAt: wordpressOAuthExpiresAt(),
  })

  const callback = new URL(redirectCheck.callback.href)
  callback.searchParams.set('code', code)
  callback.searchParams.set('state', body.state)
  if (parsed.wantsJson) {
    return NextResponse.json({ ok: true, redirectUrl: callback.href, connectionId: String(connection._id) })
  }
  return NextResponse.redirect(callback, 303)
})
