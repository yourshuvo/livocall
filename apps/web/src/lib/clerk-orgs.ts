import { clerkClient } from '@clerk/nextjs/server'
import { Types } from 'mongoose'
import { appBaseUrl } from '@/lib/mailer'
import { Org, type OrgDoc, type OrgLean } from '@/models/Org'

export type WorkspaceRole = 'owner' | 'admin' | 'agent'

type ClerkRole = 'org:admin' | 'org:member'

function orgIdOf(org: Pick<OrgDoc, '_id'> | Pick<OrgLean, '_id'>) {
  return String(org._id)
}

export function toClerkOrganizationRole(role: WorkspaceRole): ClerkRole {
  return role === 'agent' ? 'org:member' : 'org:admin'
}

export function fromClerkOrganizationRole(role: string | null | undefined): WorkspaceRole {
  return role === 'org:admin' ? 'admin' : 'agent'
}

export async function ensureClerkOrganization(org: OrgDoc | OrgLean, actorClerkId?: string | null) {
  const client = await clerkClient()
  if (org.clerkOrgId) {
    try {
      await client.organizations.getOrganization({ organizationId: org.clerkOrgId })
      return org.clerkOrgId
    } catch {
      // Recreate below if the stored Clerk organization was removed.
    }
  }

  const created = await client.organizations.createOrganization({
    name: org.name,
    createdBy: actorClerkId || undefined,
    publicMetadata: {
      livocallSlug: org.slug,
    },
    privateMetadata: {
      livocallOrgId: orgIdOf(org),
    },
  })

  await Org.updateOne({ _id: org._id }, { $set: { clerkOrgId: created.id } })
  return created.id
}

export async function updateClerkOrganizationName(org: OrgDoc | OrgLean) {
  const clerkOrgId = await ensureClerkOrganization(org)
  const client = await clerkClient()
  await client.organizations.updateOrganization(clerkOrgId, {
    name: org.name,
    publicMetadata: {
      livocallSlug: org.slug,
    },
    privateMetadata: {
      livocallOrgId: orgIdOf(org),
    },
  })
  return clerkOrgId
}

export async function getClerkOrganizationLogoUrl(org: OrgDoc | OrgLean) {
  if (!org.clerkOrgId) return null
  const client = await clerkClient()
  try {
    const clerkOrg = await client.organizations.getOrganization({ organizationId: org.clerkOrgId })
    const imageUrl =
      'imageUrl' in clerkOrg && typeof clerkOrg.imageUrl === 'string' ? clerkOrg.imageUrl : ''
    return imageUrl || null
  } catch {
    return null
  }
}

export async function ensureClerkOrganizationMembership({
  clerkOrgId,
  clerkUserId,
  role,
}: {
  clerkOrgId: string
  clerkUserId: string
  role: WorkspaceRole
}) {
  const client = await clerkClient()
  const clerkRole = toClerkOrganizationRole(role)
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId: clerkOrgId,
    userId: [clerkUserId],
    limit: 1,
  })
  const exists = memberships.data.some(
    (membership) => membership.publicUserData?.userId === clerkUserId,
  )

  if (exists) {
    await client.organizations.updateOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUserId,
      role: clerkRole,
    })
  } else {
    await client.organizations.createOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUserId,
      role: clerkRole,
    })
  }

  await client.organizations.updateOrganizationMembershipMetadata({
    organizationId: clerkOrgId,
    userId: clerkUserId,
    publicMetadata: {
      livocallRole: role,
    },
    privateMetadata: {
      livocallRole: role,
    },
  })
}

export async function removeClerkOrganizationMembership({
  clerkOrgId,
  clerkUserId,
}: {
  clerkOrgId: string
  clerkUserId: string
}) {
  const client = await clerkClient()
  try {
    await client.organizations.deleteOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUserId,
    })
  } catch {
    // The Mongo membership is still authoritative for app data; missing Clerk
    // membership should not block cleanup of a stale local row.
  }
}

export async function createClerkWorkspaceInvitation({
  org,
  inviteId,
  email,
  role,
  inviterClerkId,
}: {
  org: OrgDoc | OrgLean
  inviteId: string
  email: string
  role: WorkspaceRole
  inviterClerkId?: string | null
}) {
  const clerkOrgId = await ensureClerkOrganization(org, inviterClerkId)
  if (inviterClerkId) {
    await ensureClerkOrganizationMembership({
      clerkOrgId,
      clerkUserId: inviterClerkId,
      role: 'owner',
    })
  }

  const client = await clerkClient()
  return client.organizations.createOrganizationInvitation({
    organizationId: clerkOrgId,
    inviterUserId: inviterClerkId || undefined,
    emailAddress: email,
    role: toClerkOrganizationRole(role),
    expiresInDays: 7,
    redirectUrl: `${appBaseUrl()}/invites/clerk?orgId=${orgIdOf(org)}`,
    publicMetadata: {
      livocallInviteId: inviteId,
      livocallOrgId: orgIdOf(org),
      livocallRole: role,
    },
  })
}

export async function verifyClerkOrganizationMembership({
  clerkOrgId,
  clerkUserId,
}: {
  clerkOrgId: string
  clerkUserId: string
}) {
  const client = await clerkClient()
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId: clerkOrgId,
    userId: [clerkUserId],
    limit: 1,
  })
  return (
    memberships.data.find((membership) => membership.publicUserData?.userId === clerkUserId) ?? null
  )
}

export function objectId(value: string | null) {
  return value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null
}
