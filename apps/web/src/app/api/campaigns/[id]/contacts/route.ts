export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Campaign } from '@/models/Campaign'
import { Contact } from '@/models/Contact'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { campaignToJson } from '@/lib/serialize'

const ContactIn = z.object({
  e164: z.string().regex(/^\+\d{8,15}$/),
  name: z.string().max(120).optional().default(''),
  locale: z.enum(['bn', 'en', 'mixed']).optional().default('mixed'),
  attrs: z.record(z.string()).optional().default({}),
  tags: z.array(z.string().max(48)).max(20).optional().default([]),
})

const Body = z.object({ contacts: z.array(ContactIn).min(1).max(10_000) })

/**
 * Bulk-import contacts and append them to the campaign.
 * Upserts each contact by (orgId, e164) so it's idempotent.
 */
export const POST = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')

  const data = Body.parse(await req.json().catch(() => ({})))

  await connectMongo()
  const camp = await Campaign.findOne({ _id: oid, orgId: s.orgId })
  if (!camp) return apiError('not_found')

  // Upsert contacts
  const ops = data.contacts.map((c) => ({
    updateOne: {
      filter: { orgId: s.orgId, e164: c.e164 },
      update: { $set: { ...c, orgId: s.orgId } },
      upsert: true,
    },
  }))
  await Contact.bulkWrite(ops as unknown as Parameters<typeof Contact.bulkWrite>[0], {
    ordered: false,
  })

  // Re-fetch to get _ids
  const rows = await Contact.find(
    { orgId: s.orgId, e164: { $in: data.contacts.map((c) => c.e164) } },
    { _id: 1 },
  ).lean()

  const existing = new Set((camp.contactIds || []).map((x) => String(x)))
  for (const r of rows) existing.add(String(r._id))
  camp.contactIds = Array.from(existing) as unknown as typeof camp.contactIds
  camp.stats = {
    total: camp.contactIds?.length ?? 0,
    attempted: camp.stats?.attempted ?? 0,
    completed: camp.stats?.completed ?? 0,
    failed: camp.stats?.failed ?? 0,
    noAnswer: camp.stats?.noAnswer ?? 0,
  }
  await camp.save()

  return NextResponse.json({
    imported: rows.length,
    total: camp.contactIds?.length ?? 0,
    campaign: campaignToJson(camp.toObject()),
  })
})
