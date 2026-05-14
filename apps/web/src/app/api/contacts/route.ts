export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Contact } from '@/models/Contact'
import {
  isResponse,
  parsePagination,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { contactToJson } from '@/lib/serialize'

const One = z.object({
  e164: z.string().regex(/^\+\d{8,15}$/),
  name: z.string().max(120).optional().default(''),
  locale: z.enum(['bn', 'en', 'mixed']).optional().default('mixed'),
  attrs: z.record(z.string()).optional().default({}),
  tags: z.array(z.string().max(48)).max(20).optional().default([]),
})

const Bulk = z.object({ contacts: z.array(One).min(1).max(5000) })

export const GET = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const url = new URL(req.url)
  const { limit } = parsePagination(url, 100, 1000)
  const q = url.searchParams.get('q')
  const filter: Record<string, unknown> = { orgId: s.orgId }
  if (q) filter.$or = [{ e164: { $regex: q } }, { name: { $regex: q, $options: 'i' } }]
  await connectMongo()
  const contacts = await Contact.find(filter).sort({ createdAt: -1 }).limit(limit).lean()
  return NextResponse.json({ contacts: contacts.map(contactToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const data = await req.json().catch(() => ({}))
  await connectMongo()
  if (Array.isArray((data as { contacts?: unknown }).contacts)) {
    const body = Bulk.parse(data)
    const ops = body.contacts.map((c) => ({
      updateOne: {
        filter: { orgId: s.orgId, e164: c.e164 },
        update: { $set: { ...c, orgId: s.orgId } },
        upsert: true,
      },
    }))
    // mongoose's strict types reject string orgId; the ODM auto-casts, so
    // we relax the type just at the bulkWrite call site.
    const r = await Contact.bulkWrite(ops as unknown as Parameters<typeof Contact.bulkWrite>[0], {
      ordered: false,
    })
    return NextResponse.json({ upserted: r.upsertedCount, modified: r.modifiedCount })
  }
  const body = One.parse(data)
  const exists = await Contact.findOne({ orgId: s.orgId, e164: body.e164 })
  if (exists) return apiError('conflict', 'contact already exists')
  const created = await Contact.create({ orgId: s.orgId, ...body })
  return NextResponse.json(contactToJson(created.toObject()))
})
