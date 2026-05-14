import { NextResponse } from 'next/server'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { User } from '@/models/User'
import { Org } from '@/models/Org'
import { Membership } from '@/models/Membership'
import { apiError } from '@/lib/errors'
import { orgToJson, userToJson } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getSession()
  if (!s.userId) return apiError('unauthenticated')
  if (!isMongoConfigured()) {
    return NextResponse.json({
      user: { id: s.userId, email: s.email, role: s.role, orgId: s.orgId, name: null, locale: s.locale ?? 'en' },
      org: null,
      memberships: [],
    })
  }
  await connectMongo()
  const [user, org, memberships] = await Promise.all([
    User.findById(s.userId),
    Org.findById(s.orgId),
    Membership.find({ userId: s.userId })
      .populate<{ orgId: { _id: string; name: string; slug: string } }>({
        path: 'orgId',
        select: 'name slug',
      })
      .lean(),
  ])
  if (!user || !org) return apiError('not_found', 'session refers to a missing user/org')
  const membershipList = memberships
    .filter((m) => m.orgId && typeof m.orgId === 'object')
    .map((m) => ({
      orgId: String(m.orgId._id),
      orgName: m.orgId.name,
      orgSlug: m.orgId.slug,
      role: String(m.role),
    }))
  return NextResponse.json({
    user: userToJson(user),
    org: orgToJson(org),
    memberships: membershipList,
  })
}
