export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Invite } from '@/models/Invite'
import { Membership } from '@/models/Membership'
import { User } from '@/models/User'
import { Org } from '@/models/Org'
import { hashToken } from '@/lib/tokens'
import { apiError, withErrors } from '@/lib/errors'

const Body = z.object({
  token: z.string().min(10),
})

/**
 * Accept a workspace invite. If the account exists, we create a Membership
 * and switch them into the new org. If not, we require a password + name
 * and create the User + Membership atomically.
 */
export const POST = withErrors(async (req: Request) => {
  const { userId: clerkId } = await auth()
  if (!clerkId) return apiError('unauthenticated')
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const invite = await Invite.findOne({ tokenHash: hashToken(body.token) })
  if (
    !invite ||
    invite.acceptedAt ||
    invite.revokedAt ||
    invite.expiresAt.getTime() < Date.now()
  ) {
    return apiError('invalid_input', 'invite is invalid or expired')
  }

  const org = await Org.findById(invite.orgId)
  if (!org) return apiError('not_found', 'workspace was removed')

  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkId)
  const email = (
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
    clerkUser.emailAddresses[0]?.emailAddress ||
    ''
  ).toLowerCase()
  if (email !== invite.email) return apiError('forbidden', 'sign in with the invited email first')

  let user = await User.findOne({ clerkId })
  if (!user) {
    user = await User.create({
      email: invite.email,
      clerkId,
      name: clerkUser.fullName || clerkUser.firstName || invite.email.split('@')[0],
      orgId: org._id,
      role: invite.role,
      lastLoginAt: new Date(),
    })
  } else {
    user.email = invite.email
    user.lastLoginAt = new Date()
    await user.save()
  }

  const existing = await Membership.findOne({ userId: user._id, orgId: org._id })
  if (!existing) {
    await Membership.create({
      userId: user._id,
      orgId: org._id,
      role: invite.role,
      invitedBy: invite.invitedBy,
      acceptedAt: new Date(),
    })
  }

  invite.acceptedAt = new Date()
  await invite.save()

  await client.users.updateUserMetadata(clerkId, {
    privateMetadata: { livocallActiveOrgId: String(org._id) },
  })

  return NextResponse.json({ ok: true, orgId: String(org._id), role: invite.role })
})
