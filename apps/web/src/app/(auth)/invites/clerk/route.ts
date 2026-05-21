export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { connectMongo } from '@/lib/db'
import {
  objectId,
  fromClerkOrganizationRole,
  verifyClerkOrganizationMembership,
} from '@/lib/clerk-orgs'
import { Invite } from '@/models/Invite'
import { Membership } from '@/models/Membership'
import { Org } from '@/models/Org'
import { User } from '@/models/User'

function redirect(req: Request, path: string) {
  return NextResponse.redirect(new URL(path, req.url))
}

export async function GET(req: Request) {
  const { userId: clerkId } = await auth()
  const url = new URL(req.url)
  const orgObjectId = objectId(url.searchParams.get('orgId'))

  if (!clerkId) {
    const next = `${url.pathname}${url.search}`
    return redirect(req, `/login?redirect_url=${encodeURIComponent(next)}`)
  }
  if (!orgObjectId) return redirect(req, '/overview?invite=invalid')

  await connectMongo()
  const org = await Org.findById(orgObjectId)
  if (!org?.clerkOrgId) return redirect(req, '/overview?invite=invalid')

  const clerkMembership = await verifyClerkOrganizationMembership({
    clerkOrgId: org.clerkOrgId,
    clerkUserId: clerkId,
  })
  if (!clerkMembership) return redirect(req, '/overview?invite=not-member')

  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkId)
  const email = (
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
    clerkUser.emailAddresses[0]?.emailAddress ||
    ''
  ).toLowerCase()
  if (!email) return redirect(req, '/overview?invite=missing-email')

  const invite = await Invite.findOne({
    orgId: org._id,
    email,
    acceptedAt: { $exists: false },
    revokedAt: { $exists: false },
  }).sort({ createdAt: -1 })
  const role = invite?.role || fromClerkOrganizationRole(clerkMembership.role)

  let user = await User.findOne({ clerkId })
  if (!user) {
    user = await User.create({
      email,
      clerkId,
      name: clerkUser.fullName || clerkUser.firstName || email.split('@')[0],
      orgId: org._id,
      role,
      lastLoginAt: new Date(),
    })
  } else {
    user.email = email || user.email
    user.name = user.name || clerkUser.fullName || clerkUser.firstName || user.name
    user.lastLoginAt = new Date()
    await user.save()
  }

  await Membership.updateOne(
    { userId: user._id, orgId: org._id },
    {
      $setOnInsert: {
        invitedBy: invite?.invitedBy,
        acceptedAt: new Date(),
      },
      $set: {
        role,
      },
    },
    { upsert: true },
  )

  if (invite) {
    invite.acceptedAt = new Date()
    await invite.save()
  }

  await client.users.updateUserMetadata(clerkId, {
    privateMetadata: { livocallActiveOrgId: String(org._id) },
  })

  return redirect(req, '/overview')
}
