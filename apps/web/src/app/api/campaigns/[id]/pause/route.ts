export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Campaign } from '@/models/Campaign'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { campaignToJson } from '@/lib/serialize'

export const POST = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const c = await Campaign.findOneAndUpdate(
    { _id: oid, orgId: s.orgId, status: 'running' },
    { $set: { status: 'paused' } },
    { new: true },
  ).lean()
  if (!c) return apiError('conflict', 'campaign is not running')
  return NextResponse.json(campaignToJson(c))
})
