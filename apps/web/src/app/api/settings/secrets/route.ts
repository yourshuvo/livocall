export const dynamic = 'force-dynamic'
import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { encryptSecretValue } from '@/lib/secret-vault'
import { secretToJson } from '@/lib/serialize'
import { Secret } from '@/models/Secret'

const Body = z.object({
  name: z.string().min(2).max(80).regex(/^[A-Za-z0-9_.:-]+$/),
  kind: z.enum(['api_key', 'bearer_token', 'basic_auth', 'webhook_secret', 'custom']).default('custom'),
  provider: z.string().max(80).optional().default(''),
  value: z.string().min(1).max(10_000),
})

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  await connectMongo()
  const rows = await Secret.find({ orgId: s.orgId }).sort({ updatedAt: -1 }).lean()
  return NextResponse.json({ secrets: rows.map(secretToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const existing = await Secret.findOne({ orgId: s.orgId, name: body.name }).select('+ciphertext')
  const update = {
    kind: body.kind,
    provider: body.provider,
    ciphertext: encryptSecretValue(body.value),
    fingerprint: fingerprint(body.value),
    updatedBy: s.userId,
    rotatedAt: new Date(),
    revokedAt: undefined,
  }
  const doc = existing
    ? await Secret.findOneAndUpdate(
        { _id: existing._id, orgId: s.orgId },
        { $set: update, $inc: { version: 1 } },
        { new: true },
      ).lean()
    : await Secret.create({
        orgId: s.orgId,
        name: body.name,
        ...update,
        version: 1,
        createdBy: s.userId,
      }).then((d) => d.toObject())
  if (!doc) return apiError('not_found')
  await recordAudit(s, {
    action: existing ? 'secret.rotate' : 'secret.create',
    resource: { type: 'Secret', id: String(doc._id) },
    meta: { name: body.name, kind: body.kind, provider: body.provider },
  })
  return NextResponse.json(secretToJson(doc))
})
