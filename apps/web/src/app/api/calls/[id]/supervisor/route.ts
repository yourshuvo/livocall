export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Call } from '@/models/Call'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { voiceClient } from '@/lib/voice-client'
import { recordAudit } from '@/lib/audit'
import {
  SupervisorControlBody,
  supervisorFailureEvent,
  supervisorSuccessEvent,
} from '@/lib/supervisor-control'

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  const body = SupervisorControlBody.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const call = await Call.findOne({ _id: oid, orgId: s.orgId })
  if (!call) return apiError('not_found')
  if (call.outcome !== 'in_progress') return apiError('conflict', 'call is not live')
  try {
    const result = await voiceClient.control(
      call.edgeUuid || String(call._id),
      body.action,
      s.userId,
      body.targetE164,
    )
    call.supervisorEvents.push(
      supervisorSuccessEvent({
        action: body.action,
        supervisorId: s.userId,
        targetE164: body.targetE164,
        result,
      }),
    )
    await call.save()
    await recordAudit(s, {
      action: `call.supervisor.${body.action}`,
      resource: { type: 'Call', id: String(call._id) },
      meta: { ok: result.ok },
    })
    return NextResponse.json(result)
  } catch (e) {
    call.supervisorEvents.push(
      supervisorFailureEvent({
        action: body.action,
        supervisorId: s.userId,
        targetE164: body.targetE164,
        error: e,
      }),
    )
    await call.save()
    return apiError('upstream_error', e instanceof Error ? e.message : 'voice service error')
  }
})
