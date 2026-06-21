export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import {
  createWordPressSigningSecret,
  encryptWordPressSigningSecret,
  hashWordPressOAuthCode,
  validateWordPressOAuthRedirect,
  verifyPkceChallenge,
  withWordPressConfig,
} from '@/lib/wordpress-integration'
import { Connection } from '@/models/Connection'
import { WordPressOAuthGrant } from '@/models/WordPressOAuthGrant'

const Body = z.object({
  code: z.string().min(16).max(240),
  codeVerifier: z.string().min(32).max(240),
  state: z.string().min(16).max(240),
  callbackUrl: z.string().url().max(800).optional(),
  siteUrl: z.string().url().max(800).optional(),
})

export const POST = withErrors(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const grant = await WordPressOAuthGrant.findOne({
    codeHash: hashWordPressOAuthCode(body.code),
  })
  if (!grant) return apiError('not_found', 'authorization code not found')
  if (grant.consumedAt) return apiError('conflict', 'authorization code already used')
  if (grant.expiresAt.getTime() < Date.now()) {
    return apiError('forbidden', 'authorization code has expired')
  }
  if (grant.state !== body.state) return apiError('forbidden', 'state mismatch')
  if (!verifyPkceChallenge(body.codeVerifier, grant.codeChallenge)) {
    return apiError('forbidden', 'pkce verification failed')
  }
  if (body.callbackUrl && body.callbackUrl !== grant.callbackUrl) {
    return apiError('forbidden', 'callbackUrl mismatch')
  }
  if (body.siteUrl && body.siteUrl !== grant.siteUrl) {
    return apiError('forbidden', 'siteUrl mismatch')
  }
  const redirectCheck = validateWordPressOAuthRedirect({
    siteUrl: grant.siteUrl,
    callbackUrl: grant.callbackUrl,
  })
  if (!redirectCheck.ok) return apiError('invalid_input', redirectCheck.error)

  const consumed = await WordPressOAuthGrant.updateOne(
    { _id: grant._id, consumedAt: { $exists: false } },
    { $set: { consumedAt: new Date() } },
  )
  if (consumed.modifiedCount !== 1) {
    return apiError('conflict', 'authorization code already used')
  }

  const connection = await Connection.findOne({
    _id: grant.connectionId,
    platform: 'wordpress',
    active: true,
  })
  if (!connection) return apiError('not_found', 'wordpress connection not found')
  const signingSecret = createWordPressSigningSecret()
  const now = new Date().toISOString()
  connection.config = withWordPressConfig(connection.config, {
    registrationTokenHash: '',
    registrationTokenExpiresAt: '',
    registeredAt: now,
    oauthConnectedAt: now,
    connectionMode: 'oauth',
    signingSecretCiphertext: encryptWordPressSigningSecret(signingSecret),
    siteName: grant.siteName,
    pluginVersion: grant.pluginVersion,
  })
  connection.siteUrl = redirectCheck.site.href
  connection.lastSyncAt = new Date()
  connection.lastSyncStatus = 'oauth_registered'
  await connection.save()

  return NextResponse.json({
    ok: true,
    connectionId: String(connection._id),
    signingSecret,
    siteUrl: connection.siteUrl,
  })
})
