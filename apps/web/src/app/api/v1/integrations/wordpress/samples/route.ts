export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import {
  WORDPRESS_SIGNATURE_HEADER,
  buildWordPressFieldCatalog,
  sanitizeWordPressPayload,
  signedWordPressConnection,
  withWordPressConfig,
  wordpressConfig,
} from '@/lib/wordpress-integration'

const Sample = z.object({
  kind: z.string().min(1).max(80),
  sample: z.unknown(),
})
const Body = z.object({
  connectionId: z.string(),
  samples: z.array(Sample).max(10),
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

  const cfg = wordpressConfig(connection.config)
  const stored = [
    ...(cfg.samples || []),
    ...body.samples.map((sample) => ({
      kind: sample.kind,
      receivedAt: new Date().toISOString(),
      sample: sanitizeWordPressPayload(sample.sample),
    })),
  ].slice(-20)
  const fields = buildWordPressFieldCatalog(
    stored.map((sample) => ({
      kind: sample.kind,
      sample: sample.sample,
    })),
  )
  connection.config = withWordPressConfig(connection.config, { ...cfg, samples: stored, fields })
  connection.lastSyncAt = new Date()
  connection.lastSyncStatus = `sample fields synced (${stored.length})`
  await connection.save()
  return NextResponse.json({ ok: true, fields })
})
