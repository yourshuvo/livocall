export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import { Connection } from '@/models/Connection'
import {
  createWordPressSigningSecret,
  encryptWordPressSigningSecret,
  hashWordPressToken,
  withWordPressConfig,
  wordpressConfig,
} from '@/lib/wordpress-integration'

const Body = z.object({
  token: z.string().min(16).max(200),
  siteUrl: z.string().url().max(500).optional(),
  siteName: z.string().max(200).optional().default(''),
  pluginVersion: z.string().max(40).optional().default(''),
})

export const POST = withErrors(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const connection = await Connection.findOne({
    platform: 'wordpress',
    active: true,
    'config.wordpress.registrationTokenHash': hashWordPressToken(body.token),
  })
  if (!connection) return apiError('not_found', 'connection token not found')

  const cfg = wordpressConfig(connection.config)
  const expiresAt = cfg.registrationTokenExpiresAt ? new Date(cfg.registrationTokenExpiresAt) : null
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    return apiError('forbidden', 'connection token has expired')
  }

  const signingSecret = createWordPressSigningSecret()
  connection.config = withWordPressConfig(connection.config, {
    registrationTokenHash: '',
    registrationTokenExpiresAt: '',
    registeredAt: new Date().toISOString(),
    connectionMode: 'token',
    signingSecretCiphertext: encryptWordPressSigningSecret(signingSecret),
    siteName: body.siteName,
    pluginVersion: body.pluginVersion,
  })
  if (body.siteUrl) connection.siteUrl = body.siteUrl
  connection.lastSyncAt = new Date()
  connection.lastSyncStatus = 'registered'
  await connection.save()

  return NextResponse.json({
    ok: true,
    connectionId: String(connection._id),
    signingSecret,
    siteUrl: connection.siteUrl,
  })
})
