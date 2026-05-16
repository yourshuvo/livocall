export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { Invite } from '@/models/Invite'
import { recordAudit } from '@/lib/audit'

export const DELETE = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const invite = await Invite.findOneAndUpdate(
    { _id: oid, orgId: s.orgId, acceptedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
    { new: true },
  ).lean()
  if (!invite) return apiError('not_found')
  await recordAudit(s, {
    action: 'invite.revoke',
    resource: { type: 'Invite', id: String(invite._id) },
  })
  return NextResponse.json({ ok: true })
})
