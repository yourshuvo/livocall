export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Contact } from '@/models/Contact'
import { authV1, isResponse } from '@/lib/auth/v1'
import { withErrors } from '@/lib/errors'
import { contactToJson } from '@/lib/serialize'

const Body = z.object({
  e164: z.string().regex(/^\+\d{8,15}$/),
  name: z.string().max(200).optional(),
  locale: z.enum(['bn', 'en', 'mixed']).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  attrs: z.record(z.string()).optional(),
})

export const GET = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'contacts:read')
  if (isResponse(auth)) return auth
  const url = new URL(req.url)
  const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 50))
  const q = url.searchParams.get('q')
  await connectMongo()
  const filter: Record<string, unknown> = { orgId: auth.orgId }
  if (q) filter.$or = [{ e164: { $regex: q } }, { name: { $regex: q, $options: 'i' } }]
  const rows = await Contact.find(filter).sort({ updatedAt: -1 }).limit(limit).lean()
  return NextResponse.json({ data: rows.map(contactToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'contacts:write')
  if (isResponse(auth)) return auth
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const doc = await Contact.findOneAndUpdate(
    { orgId: auth.orgId, e164: body.e164 },
    {
      $set: {
        name: body.name ?? '',
        locale: body.locale ?? 'mixed',
        tags: body.tags ?? [],
        attrs: body.attrs ?? {},
      },
      $setOnInsert: { orgId: auth.orgId, e164: body.e164 },
    },
    { upsert: true, new: true },
  ).lean()
  return NextResponse.json(contactToJson(doc!), { status: 201 })
})
