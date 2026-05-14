export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { verifyProductionIndexes } from '@/lib/index-verification'

export const POST = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'owner')
  if (forbidden) return forbidden
  await connectMongo()
  const results = await verifyProductionIndexes()
  return NextResponse.json({ results })
})
