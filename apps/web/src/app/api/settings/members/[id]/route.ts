export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { Membership } from '@/models/Membership'
import { recordAudit } from '@/lib/audit'

const Patch = z.object({ role: z.enum(['owner', 'admin', 'agent']) })

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  const body = Patch.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const current = await Membership.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!current) return apiError('not_found')
  if (current.role === 'owner' && body.role !== 'owner') {
    const owners = await Membership.countDocuments({ orgId: s.orgId, role: 'owner' })
    if (owners <= 1) return apiError('forbidden', 'cannot demote the only owner')
  }
  const m = await Membership.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $set: { role: body.role } },
    { new: true },
  ).lean()
  if (!m) return apiError('not_found')
  await recordAudit(s, {
    action: 'member.update',
    resource: { type: 'Membership', id: String(m._id) },
    meta: { newRole: body.role },
  })
  return NextResponse.json({ ok: true })
})

export const DELETE = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const m = await Membership.findOne({ _id: oid, orgId: s.orgId })
  if (!m) return apiError('not_found')
  if (String(m.userId) === s.userId) {
    return apiError('forbidden', "you can't remove yourself")
  }
  // Don't allow removing the last owner
  if (m.role === 'owner') {
    const owners = await Membership.countDocuments({ orgId: s.orgId, role: 'owner' })
    if (owners <= 1) return apiError('forbidden', 'cannot remove the only owner')
  }
  await m.deleteOne()
  await recordAudit(s, {
    action: 'member.remove',
    resource: { type: 'Membership', id: String(m._id) },
  })
  return NextResponse.json({ ok: true })
})
