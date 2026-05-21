export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { Invite } from '@/models/Invite'
import { recordAudit } from '@/lib/audit'
import { Org } from '@/models/Org'
import { clerkClient } from '@clerk/nextjs/server'

function isClerkMissingError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const status = 'status' in error ? Number(error.status) : null
  const errors =
    'errors' in error && Array.isArray(error.errors)
      ? (error.errors as Array<{ code?: unknown }>)
      : []
  return (
    status === 404 ||
    errors.some((entry) => typeof entry.code === 'string' && entry.code.includes('not_found'))
  )
}

export const DELETE = withErrors(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const s = await requireDashboardSession()
    if (isResponse(s)) return s
    const forbidden = requireRole(s, 'admin')
    if (forbidden) return forbidden
    const oid = objectIdOr400(id)
    if (!oid) return apiError('invalid_input')
    await connectMongo()
    const invite = await Invite.findOne({
      _id: oid,
      orgId: s.orgId,
      acceptedAt: { $exists: false },
      revokedAt: { $exists: false },
    })
    if (!invite) return apiError('not_found')
    let clerkRevoked = false
    if (invite.clerkInvitationId) {
      const org = await Org.findById(s.orgId).lean()
      if (!org) return apiError('not_found', 'workspace was removed')
      if (!org.clerkOrgId) {
        return apiError('upstream_error', 'Clerk workspace sync is missing for this invite')
      }
      const client = await clerkClient()
      try {
        await client.organizations.revokeOrganizationInvitation({
          organizationId: org.clerkOrgId,
          invitationId: invite.clerkInvitationId,
          requestingUserId: s.clerkId,
        })
        clerkRevoked = true
      } catch (error) {
        if (!isClerkMissingError(error)) {
          return apiError('upstream_error', 'Clerk invite could not be revoked. Try again.')
        }
        clerkRevoked = true
      }
    }
    invite.revokedAt = new Date()
    await invite.save()
    await recordAudit(s, {
      action: 'invite.revoke',
      resource: { type: 'Invite', id: String(invite._id) },
      meta: { clerkRevoked },
    })
    return NextResponse.json({ ok: true })
  },
)
