export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Call } from '@/models/Call'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { voiceClient } from '@/lib/voice-client'
import { recordAudit } from '@/lib/audit'

const Body = z.object({
  action: z.enum(['listen', 'whisper', 'barge']),
})

export const POST = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const call = await Call.findOne({ _id: oid, orgId: s.orgId })
  if (!call) return apiError('not_found')
  if (call.outcome !== 'in_progress') return apiError('conflict', 'call is not live')
  try {
    const result = await voiceClient.control(call.fsUuid || String(call._id), body.action, s.userId)
    call.supervisorEvents.push({
      action: body.action,
      supervisorId: s.userId,
      at: new Date(),
      ok: result.ok,
      streamUrl: result.streamUrl || '',
    })
    await call.save()
    await recordAudit(s, {
      action: `call.supervisor.${body.action}`,
      resource: { type: 'Call', id: String(call._id) },
      meta: { ok: result.ok },
    })
    return NextResponse.json(result)
  } catch (e) {
    call.supervisorEvents.push({
      action: body.action,
      supervisorId: s.userId,
      at: new Date(),
      ok: false,
      error: e instanceof Error ? e.message : 'voice service error',
    })
    await call.save()
    return apiError('upstream_error', e instanceof Error ? e.message : 'voice service error')
  }
})
