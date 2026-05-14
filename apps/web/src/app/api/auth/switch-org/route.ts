export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Membership } from '@/models/Membership'
import { Types } from 'mongoose'
import { apiError, withErrors } from '@/lib/errors'

const Body = z.object({ orgId: z.string().min(1) })

export const POST = withErrors(async (req: Request) => {
  const { userId: clerkId } = await auth()
  if (!clerkId) return apiError('unauthenticated')
  const session = await getSession()
  if (!session.userId) return apiError('unauthenticated')
  const { orgId } = Body.parse(await req.json().catch(() => ({})))
  if (!Types.ObjectId.isValid(orgId)) return apiError('invalid_input')
  await connectMongo()
  const m = await Membership.findOne({ userId: session.userId, orgId })
  if (!m) return apiError('forbidden', 'not a member of that workspace')
  const client = await clerkClient()
  await client.users.updateUserMetadata(clerkId, {
    privateMetadata: { livocallActiveOrgId: String(m.orgId) },
  })
  return NextResponse.json({ ok: true, orgId: String(m.orgId), role: m.role })
})
