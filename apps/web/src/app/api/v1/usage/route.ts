export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Org } from '@/models/Org'
import { Call } from '@/models/Call'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'

export const GET = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'billing:read')
  if (isResponse(auth)) return auth
  await connectMongo()
  const [org, todayCount, weekCount] = await Promise.all([
    Org.findById(auth.orgId).lean(),
    Call.countDocuments({
      orgId: auth.orgId,
      startedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
    Call.countDocuments({
      orgId: auth.orgId,
      startedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
  ])
  if (!org) return apiError('not_found', 'org not found')
  return NextResponse.json({
    creditsPaisa: org.creditsPaisa ?? 0,
    calls: { last24h: todayCount, last7d: weekCount },
  })
})
