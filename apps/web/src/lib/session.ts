import { auth, clerkClient } from '@clerk/nextjs/server'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { Org } from '@/models/Org'
import { Membership } from '@/models/Membership'
import { User } from '@/models/User'

export type Session = {
  userId: string | null
  orgId: string | null
  clerkId?: string
  email?: string
  name?: string
  role?: 'owner' | 'admin' | 'agent'
  locale?: 'en' | 'bn'
}

type Role = 'owner' | 'admin' | 'agent'

type ClerkDashboardUser = Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>['users']['getUser']>>

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'workspace'
  )
}

function primaryEmail(clerkUser: ClerkDashboardUser) {
  return (
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
    clerkUser.emailAddresses[0]?.emailAddress ||
    ''
  ).toLowerCase()
}

function displayName(clerkUser: ClerkDashboardUser) {
  return clerkUser.fullName || clerkUser.firstName || primaryEmail(clerkUser).split('@')[0] || 'User'
}

async function uniqueOrgSlug(name: string) {
  let slug = slugify(name)
  let n = 0
  while (await Org.findOne({ slug }).lean()) {
    n += 1
    slug = `${slugify(name)}-${n}`
  }
  return slug
}

async function updateActiveOrg(clerkId: string, orgId: string | null) {
  const client = await clerkClient()
  await client.users.updateUserMetadata(clerkId, {
    privateMetadata: { livocallActiveOrgId: orgId },
  })
}

export async function ensureDashboardUser(): Promise<Session> {
  const a = await auth()
  if (!a.userId) return { userId: null, orgId: null }
  const client = await clerkClient()
  const clerkUser = await client.users.getUser(a.userId)
  const email = primaryEmail(clerkUser)
  const name = displayName(clerkUser)

  if (!isMongoConfigured()) {
    return { userId: a.userId, orgId: null, clerkId: a.userId, email, name, role: 'owner', locale: 'en' }
  }

  await connectMongo()
  let user = await User.findOne({ clerkId: a.userId })
  if (!user && email) {
    user = await User.findOne({ email })
    if (user) {
      user.clerkId = a.userId
      user.name = user.name || name
      user.lastLoginAt = new Date()
      await user.save()
    }
  }

  if (!user) {
    const orgName = `${name}'s Workspace`
    const org = await Org.create({
      name: orgName,
      slug: await uniqueOrgSlug(orgName),
      plan: 'starter',
      creditsPaisa: 10_000,
    })
    user = await User.create({
      clerkId: a.userId,
      email,
      name,
      orgId: org._id,
      role: 'owner',
      lastLoginAt: new Date(),
    })
    await Membership.create({
      userId: user._id,
      orgId: org._id,
      role: 'owner',
      acceptedAt: new Date(),
    })
  } else {
    user.email = email || user.email
    user.name = user.name || name
    user.lastLoginAt = new Date()
    await user.save()
  }

  let activeOrgId =
    typeof clerkUser.privateMetadata.livocallActiveOrgId === 'string'
      ? clerkUser.privateMetadata.livocallActiveOrgId
      : String(user.orgId)
  let membership = await Membership.findOne({ userId: user._id, orgId: activeOrgId })

  if (!membership) {
    membership = await Membership.findOne({ userId: user._id })
    activeOrgId = membership ? String(membership.orgId) : String(user.orgId)
    await updateActiveOrg(a.userId, activeOrgId)
  } else if (clerkUser.privateMetadata.livocallActiveOrgId !== activeOrgId) {
    await updateActiveOrg(a.userId, activeOrgId)
  }

  return {
    userId: String(user._id),
    orgId: activeOrgId,
    clerkId: a.userId,
    email: user.email,
    name: user.name || name,
    role: (membership?.role || user.role || 'agent') as Role,
    locale: user.locale as 'en' | 'bn',
  }
}

export async function getSession() {
  const a = await auth()
  if (!a.userId) return { userId: null, orgId: null }
  return ensureDashboardUser()
}

export async function requireSession() {
  const s = await ensureDashboardUser()
  if (!s.userId || !s.orgId) {
    throw new Error('UNAUTHENTICATED')
  }
  return s
}
