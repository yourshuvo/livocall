export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import {
  WORDPRESS_SIGNATURE_HEADER,
  signedWordPressConnection,
  wordpressMetadataFromEvent,
} from '@/lib/wordpress-integration'
import { normalizeBdPhoneToE164, isE164 } from '@/lib/phone-number'
import { Agent } from '@/models/Agent'
import { Call } from '@/models/Call'
import { DncEntry } from '@/models/DncEntry'
import { voiceClient } from '@/lib/voice-client'

const Body = z.object({
  connectionId: z.string(),
  eventId: z.string().min(1).max(160),
  eventType: z.string().min(1).max(120),
  trigger: z.string().min(1).max(120),
  resource: z.object({
    type: z.string().min(1).max(80).default('order'),
    id: z.union([z.string(), z.number()]).transform(String),
  }),
  phone: z.string().min(5).max(60).optional().default(''),
  agentId: z.string().optional().default(''),
  payload: z.unknown().optional().default({}),
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

  const existing = await Call.findOne({
    orgId: connection.orgId,
    'metadata.wordpressEventId': body.eventId,
  }).lean()
  if (existing) {
    return NextResponse.json({
      ok: true,
      originated: false,
      duplicate: true,
      callId: String(existing._id),
    })
  }

  const cfg = (connection.config || {}) as { defaultAgentId?: string; defaultFromE164?: string }
  const agentId = body.agentId || String(cfg.defaultAgentId || '')
  if (!agentId) return NextResponse.json({ ok: true, originated: false, reason: 'missing_agent' })
  const agent = await Agent.findOne({ _id: agentId, orgId: connection.orgId }).lean()
  if (!agent) return apiError('not_found', 'agent not found')
  const toE164 = normalizeBdPhoneToE164(body.phone)
  if (!isE164(toE164)) {
    return NextResponse.json({ ok: true, originated: false, reason: 'missing_phone' })
  }
  const dnc = await DncEntry.exists({ orgId: connection.orgId, e164: toE164 })
  if (dnc) return NextResponse.json({ ok: true, originated: false, reason: 'dnc' })

  const metadata = wordpressMetadataFromEvent({
    connectionId: String(connection._id),
    eventId: body.eventId,
    trigger: body.trigger,
    resourceType: body.resource.type,
    resourceId: body.resource.id,
    payload: body.payload,
  })
  const r = await voiceClient.originate({
    agentId,
    toE164,
    fromE164: cfg.defaultFromE164 || undefined,
    tier: agent.tier,
    metadata,
  })
  return NextResponse.json({ ok: true, originated: true, callId: r.callId, edgeUuid: r.edgeUuid })
})
