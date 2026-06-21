export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import { normalizeBdPhoneToE164, isE164 } from '@/lib/phone-number'
import {
  WORDPRESS_SIGNATURE_HEADER,
  normalizeWordPressContactTags,
  sanitizeWordPressContactAttrs,
  signedWordPressConnection,
} from '@/lib/wordpress-integration'
import { Contact } from '@/models/Contact'

const ContactIn = z.object({
  e164: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  name: z.string().max(200).optional().default(''),
  email: z.string().max(200).optional().default(''),
  locale: z.enum(['bn', 'en', 'mixed']).optional().default('mixed'),
  tags: z.array(z.string().max(48)).max(20).optional().default([]),
  attrs: z.record(z.unknown()).optional().default({}),
})

const Body = z.object({
  connectionId: z.string(),
  contacts: z.array(ContactIn).min(1).max(1000),
})

export const POST = withErrors(async (req: Request) => {
  const raw = await req.text()
  const body = Body.parse(raw ? JSON.parse(raw) : {})
  await connectMongo()
  const connection = await signedWordPressConnection(
    body.connectionId,
    raw,
    req.headers.get(WORDPRESS_SIGNATURE_HEADER) || req.headers.get('x-livocall-signature') || '',
  )
  if (!connection) return apiError('forbidden', 'bad wordpress signature')

  const ops = []
  let skipped = 0
  for (const contact of body.contacts) {
    const e164 = normalizeBdPhoneToE164(contact.e164 || contact.phone)
    if (!isE164(e164)) {
      skipped += 1
      continue
    }
    const attrs = sanitizeWordPressContactAttrs({
      ...contact.attrs,
      email: contact.email || contact.attrs.email,
      wordpressConnectionId: String(connection._id),
      wordpressSiteUrl: connection.siteUrl || '',
    })
    const set: Record<string, unknown> = {
      locale: contact.locale || 'mixed',
    }
    if (contact.name) set.name = contact.name
    for (const [key, value] of Object.entries(attrs)) {
      set[`attrs.${key}`] = value
    }
    ops.push({
      updateOne: {
        filter: { orgId: connection.orgId, e164 },
        update: {
          $set: set,
          $setOnInsert: { orgId: connection.orgId, e164 },
          $addToSet: { tags: { $each: normalizeWordPressContactTags(contact.tags) } },
        },
        upsert: true,
      },
    })
  }
  if (ops.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0, modified: 0, skipped })
  }
  const result = await Contact.bulkWrite(ops as unknown as Parameters<typeof Contact.bulkWrite>[0], {
    ordered: false,
  })
  return NextResponse.json({
    ok: true,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    matched: result.matchedCount,
    skipped,
  })
})
