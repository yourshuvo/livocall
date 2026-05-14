export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Connection, CONNECTION_PLATFORMS } from '@/models/Connection'
import { ApiKey } from '@/models/ApiKey'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { randomToken } from '@/lib/hmac'

const Body = z.object({
  platform: z.enum(CONNECTION_PLATFORMS),
  name: z.string().min(1).max(120),
  siteUrl: z.string().max(500).optional().default(''),
  config: z.record(z.unknown()).optional().default({}),
})

const SCOPES_BY_PLATFORM: Record<string, string[]> = {
  wordpress: ['calls:read', 'calls:write', 'agents:read', 'dnc:read', 'dnc:write'],
  shopify: ['calls:read', 'calls:write', 'agents:read', 'dnc:read', 'dnc:write'],
  zapier: ['calls:read', 'calls:write', 'agents:read', 'campaigns:write', 'contacts:write', 'dnc:read', 'dnc:write'],
  make: ['calls:read', 'calls:write', 'agents:read', 'campaigns:write', 'contacts:write', 'dnc:read', 'dnc:write'],
  n8n: ['calls:read', 'calls:write', 'agents:read', 'campaigns:write', 'contacts:write', 'dnc:read', 'dnc:write'],
  rest: ['*'],
}

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const items = await Connection.find({ orgId: s.orgId }).sort({ updatedAt: -1 }).lean()
  return NextResponse.json({
    connections: items.map((c) => ({
      id: String(c._id),
      platform: c.platform,
      name: c.name,
      siteUrl: c.siteUrl,
      active: c.active,
      apiKeyId: String(c.apiKeyId),
      config: c.config,
      lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
      lastSyncStatus: c.lastSyncStatus,
      createdAt: c.createdAt.toISOString(),
    })),
  })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  if (s.role !== 'owner' && s.role !== 'admin') return apiError('forbidden')
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()

  // Auto-mint a scoped API key for this connection.
  const plaintext = randomToken(`lvo_${body.platform.slice(0, 4)}_`, 24)
  const hash = await bcrypt.hash(plaintext, 10)
  const apiKey = await ApiKey.create({
    orgId: s.orgId,
    name: `${body.name} (${body.platform})`,
    prefix: plaintext.slice(0, 16),
    hash,
    scopes: SCOPES_BY_PLATFORM[body.platform] ?? ['calls:read', 'agents:read'],
    createdBy: s.userId,
  })

  const conn = await Connection.create({
    orgId: s.orgId,
    platform: body.platform,
    name: body.name,
    siteUrl: body.siteUrl,
    config: body.config,
    apiKeyId: apiKey._id,
    createdBy: s.userId,
  })

  return NextResponse.json({
    id: String(conn._id),
    platform: conn.platform,
    name: conn.name,
    siteUrl: conn.siteUrl,
    apiKey: { id: String(apiKey._id), prefix: apiKey.prefix, plaintext, scopes: apiKey.scopes },
    config: conn.config,
    active: conn.active,
    createdAt: conn.createdAt.toISOString(),
  })
})
