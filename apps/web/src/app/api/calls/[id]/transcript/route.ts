export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Call } from '@/models/Call'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { enforceTranscriptCompliance } from '@/lib/compliance'

const AppendTranscriptBody = z.object({
  role: z.enum(['user', 'agent']),
  text: z.string().trim().min(1).max(8000),
  at: z.string().datetime().optional(),
  clientTurnId: z.string().trim().min(1).max(160),
})

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

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  const body = AppendTranscriptBody.parse(await req.json().catch(() => ({})))
  const at = body.at ? new Date(body.at) : new Date()

  await connectMongo()
  const filter = {
    _id: oid,
    orgId: s.orgId,
    'metadata.source': 'dashboard-browser-test',
  }
  const call = await Call.findOne(filter).select('_id transcript').lean()
  if (!call) return apiError('not_found')

  const alreadyStored = (call.transcript || []).some((turn) => turn.clientTurnId === body.clientTurnId)
  if (alreadyStored) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const result = await Call.updateOne(
    { ...filter, 'transcript.clientTurnId': { $ne: body.clientTurnId } },
    {
      $push: {
        transcript: {
          role: body.role,
          text: body.text,
          at,
          clientTurnId: body.clientTurnId,
        },
      },
    },
  )

  if (result.modifiedCount > 0) {
    await enforceTranscriptCompliance(String(oid))
  }

  return NextResponse.json({ ok: true, duplicate: result.modifiedCount === 0 })
})
