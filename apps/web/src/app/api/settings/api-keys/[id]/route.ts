export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { ApiKey } from '@/models/ApiKey'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'

export const DELETE = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const updated = await ApiKey.findOneAndUpdate(
    { _id: oid, orgId: s.orgId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
  if (!updated) return apiError('not_found')
  await recordAudit(s, {
    action: 'api_key.revoke',
    resource: { type: 'ApiKey', id: String(oid) },
  })
  return NextResponse.json({ ok: true })
})
