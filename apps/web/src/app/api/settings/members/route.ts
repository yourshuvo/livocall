export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { Membership } from '@/models/Membership'
import { Invite } from '@/models/Invite'
import { User } from '@/models/User'
import { generateToken, hashToken } from '@/lib/tokens'
import { sendMail, appBaseUrl } from '@/lib/mailer'
import { recordAudit } from '@/lib/audit'

interface MemberRow {
  id: string
  userId: string
  email: string
  name: string | null
  role: string
  invitedBy: string | null
  acceptedAt: string | null
  createdAt: string | null
  lastLoginAt: string | null
}

interface InviteRow {
  id: string
  email: string
  role: string
  invitedBy: string | null
  createdAt: string | null
  expiresAt: string | null
}

const InviteBody = z.object({
  email: z.string().email().max(254),
  role: z.enum(['owner', 'admin', 'agent']).default('agent'),
})

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const memberships = await Membership.find({ orgId: s.orgId })
    .populate<{
      userId: { _id: string; email: string; name?: string; lastLoginAt?: Date }
    }>({
      path: 'userId',
      select: 'email name lastLoginAt',
    })
    .lean()
  const invites = await Invite.find({
    orgId: s.orgId,
    acceptedAt: { $exists: false },
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean()

  const members: MemberRow[] = memberships.map((m) => ({
    id: String(m._id),
    userId: String(m.userId?._id ?? ''),
    email: m.userId?.email ?? '',
    name: m.userId?.name ?? null,
    role: String(m.role),
    invitedBy: m.invitedBy ? String(m.invitedBy) : null,
    acceptedAt: m.acceptedAt ? new Date(m.acceptedAt).toISOString() : null,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    lastLoginAt: m.userId?.lastLoginAt
      ? new Date(m.userId.lastLoginAt).toISOString()
      : null,
  }))
  const pending: InviteRow[] = invites.map((i) => ({
    id: String(i._id),
    email: i.email,
    role: String(i.role),
    invitedBy: i.invitedBy ? String(i.invitedBy) : null,
    createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : null,
    expiresAt: i.expiresAt ? new Date(i.expiresAt).toISOString() : null,
  }))
  return NextResponse.json({ members, pending })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const body = InviteBody.parse(await req.json().catch(() => ({})))

  await connectMongo()
  const existingUser = await User.findOne({ email: body.email.toLowerCase() })
  if (existingUser) {
    const m = await Membership.findOne({
      userId: existingUser._id,
      orgId: s.orgId,
    })
    if (m) return apiError('conflict', 'user is already a member')
  }
  const pending = await Invite.findOne({
    orgId: s.orgId,
    email: body.email.toLowerCase(),
    acceptedAt: { $exists: false },
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
  if (pending) return apiError('conflict', 'invite already pending')

  const token = generateToken()
  const invite = await Invite.create({
    orgId: s.orgId,
    email: body.email.toLowerCase(),
    role: body.role,
    tokenHash: hashToken(token),
    invitedBy: s.userId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
  })
  const link = `${appBaseUrl()}/invites/${token}`
  await sendMail({
    to: body.email,
    subject: "You're invited to join a LivoCall workspace",
    text: `You've been invited to join a workspace on LivoCall as ${body.role}.\n\nAccept the invite within 7 days:\n${link}\n\nIf you didn't expect this email, you can safely ignore it.`,
  })
  await recordAudit(s, {
    action: 'member.invite',
    resource: { type: 'Invite', id: String(invite._id) },
    meta: { email: body.email, role: body.role },
  })
  return NextResponse.json({
    id: String(invite._id),
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
  })
})
