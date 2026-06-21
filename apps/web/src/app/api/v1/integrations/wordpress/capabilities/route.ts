export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import {
  WORDPRESS_SIGNATURE_HEADER,
  signedWordPressConnection,
  withWordPressConfig,
  wordpressConfig,
} from '@/lib/wordpress-integration'

const Body = z.object({
  connectionId: z.string(),
  capabilities: z.record(z.unknown()).default({}),
  site: z.record(z.unknown()).optional().default({}),
})

export const POST = withErrors(async (req: Request) => {
  const raw = await req.text()
  const body = Body.parse(raw ? JSON.parse(raw) : {})
  await connectMongo()
  const connection = await signedWordPressConnection(
    body.connectionId,
    raw,
    req.headers.get(WORDPRESS_SIGNATURE_HEADER) || req.headers.get('x-livocall-signature') || '',
  )
  if (!connection) return apiError('forbidden', 'bad wordpress signature')
  connection.config = withWordPressConfig(connection.config, {
    ...wordpressConfig(connection.config),
    capabilities: body.capabilities,
  })
  connection.lastSyncAt = new Date()
  connection.lastSyncStatus = 'capabilities synced'
  await connection.save()
  return NextResponse.json({ ok: true })
})
