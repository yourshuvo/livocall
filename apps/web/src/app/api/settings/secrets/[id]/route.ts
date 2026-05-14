export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { Secret } from '@/models/Secret'

export const DELETE = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const doc = await Secret.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $set: { revokedAt: new Date(), updatedBy: s.userId } },
    { new: true },
  ).lean()
  if (!doc) return apiError('not_found')
  await recordAudit(s, {
    action: 'secret.revoke',
    resource: { type: 'Secret', id: String(doc._id) },
    meta: { name: doc.name },
  })
  return NextResponse.json({ ok: true })
})
