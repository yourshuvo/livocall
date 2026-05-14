export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { User } from '@/models/User'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'

const Body = z.object({
  name: z.string().max(120).optional(),
})

export const PATCH = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const user = await User.findById(s.userId)
  if (!user) return apiError('not_found', 'user not found')
  if (typeof body.name === 'string') user.name = body.name.trim()
  await user.save()
  return NextResponse.json({ ok: true, name: user.name ?? '' })
})
