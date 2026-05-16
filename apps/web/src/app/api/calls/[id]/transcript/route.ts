export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Call } from '@/models/Call'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'

export const GET = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const call = await Call.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!call) return apiError('not_found')
  const url = new URL(req.url)
  const after = Number(url.searchParams.get('after') || 0)
  const transcript = (call.transcript || []).slice(Math.max(0, after)).map((turn, index) => ({
    index: after + index,
    role: turn.role,
    text: turn.text,
    at: turn.at instanceof Date ? turn.at.toISOString() : String(turn.at),
  }))
  return NextResponse.json({
    callId: String(call._id),
    outcome: call.outcome,
    cursor: after + transcript.length,
    transcript,
  })
})
