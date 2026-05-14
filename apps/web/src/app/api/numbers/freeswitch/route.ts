export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { PhoneNumber } from '@/models/PhoneNumber'

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const numbers = await PhoneNumber.find({ orgId: s.orgId, inboundEnabled: true })
    .sort({ e164: 1 })
    .lean()
  return NextResponse.json({
    numbers: numbers.map((n) => ({
      e164: n.e164,
      sipServer: n.sipServer,
      sipUsername: n.sipUsername,
      agentId: n.agentId ? String(n.agentId) : null,
    })),
  })
})