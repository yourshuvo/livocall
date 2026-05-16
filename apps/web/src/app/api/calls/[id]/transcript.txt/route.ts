export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Call } from '@/models/Call'
import { Org } from '@/models/Org'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'

export const GET = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  if (s.role === 'agent') {
    const org = await Org.findById(s.orgId).lean()
    if (org?.compliance?.agentRoleCanExport !== true) return apiError('forbidden')
  }
  const call = await Call.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!call) return apiError('not_found')
  const lines = [
    `Call ${String(call._id)}`,
    `${call.fromE164} -> ${call.toE164}`,
    `Outcome: ${call.outcome}`,
    '',
    ...(call.transcript || []).map((t) => `[${t.at?.toISOString?.() ?? ''}] ${t.role}: ${t.text}`),
  ]
  return new NextResponse(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="call-${String(call._id)}-transcript.txt"`,
    },
  })
})
