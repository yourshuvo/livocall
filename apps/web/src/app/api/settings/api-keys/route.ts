export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { ApiKey } from '@/models/ApiKey'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { apiKeyToJson } from '@/lib/serialize'
import { randomToken } from '@/lib/hmac'

const Body = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1).max(64)).max(20).optional(),
})

const ALL_SCOPES = [
  'calls:read',
  'calls:write',
  'agents:read',
  'agents:write',
  'campaigns:read',
  'campaigns:write',
  'contacts:read',
  'contacts:write',
  'knowledge:read',
  'knowledge:write',
  'numbers:read',
  'numbers:write',
  'billing:read',
  'dnc:read',
  'dnc:write',
  '*',
]

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const keys = await ApiKey.find({ orgId: s.orgId }).sort({ createdAt: -1 }).lean()
  return NextResponse.json({ apiKeys: keys.map((k) => apiKeyToJson(k)) })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const body = Body.parse(await req.json().catch(() => ({})))
  for (const sc of body.scopes ?? []) {
    if (!ALL_SCOPES.includes(sc)) {
      return apiError('invalid_input', `unknown scope: ${sc}`)
    }
  }
  await connectMongo()
  const plaintext = randomToken('lvo_', 24)
  const hash = await bcrypt.hash(plaintext, 10)
  const created = await ApiKey.create({
    orgId: s.orgId,
    name: body.name,
    prefix: plaintext.slice(0, 12),
    hash,
    scopes: body.scopes ?? ['calls:read', 'calls:write', 'agents:read'],
    createdBy: s.userId,
  })
  await recordAudit(s, {
    action: 'api_key.create',
    resource: { type: 'ApiKey', id: String(created._id) },
    meta: { name: body.name, scopes: created.scopes },
  })
  return NextResponse.json(apiKeyToJson(created.toObject(), plaintext))
})
