export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Campaign } from '@/models/Campaign'
import { PhoneNumber } from '@/models/PhoneNumber'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { campaignToJson } from '@/lib/serialize'

export const POST = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const camp = await Campaign.findOne({
    _id: oid,
    orgId: s.orgId,
    status: { $in: ['draft', 'paused', 'scheduled'] },
  })
  if (!camp) return apiError('conflict', 'campaign is not in a startable state')
  if (!camp.contactIds?.length) return apiError('invalid_input', 'import contacts before starting')
  const numberFilter = camp.fromE164
    ? { orgId: s.orgId, e164: camp.fromE164, outboundEnabled: true }
    : { orgId: s.orgId, outboundEnabled: true }
  const outbound = await PhoneNumber.findOne(numberFilter).lean()
  if (!outbound) {
    return apiError(
      'invalid_input',
      camp.fromE164
        ? 'selected outbound number is not available'
        : 'connect an outbound phone number before starting',
    )
  }
  camp.status = 'running'
  await camp.save()
  const c = camp.toObject()
  return NextResponse.json(campaignToJson(c))
})
