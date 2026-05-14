export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Org } from '@/models/Org'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { getUsage } from '@/lib/billing'

export const GET = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const url = new URL(req.url)
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days') ?? 30)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  await connectMongo()
  const [usage, org] = await Promise.all([getUsage(s.orgId, since), Org.findById(s.orgId).lean()])
  return NextResponse.json({
    sinceIso: since.toISOString(),
    days,
    creditsPaisa: org?.creditsPaisa ?? 0,
    plan: org?.plan ?? 'starter',
    ...usage,
  })
})
