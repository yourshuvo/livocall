export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Connection } from '@/models/Connection'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { wordpressConfig } from '@/lib/wordpress-integration'

export const GET = withErrors(async () => {
  const session = await requireDashboardSession()
  if (isResponse(session)) return session
  await connectMongo()
  const connections = await Connection.find({
    orgId: session.orgId,
    platform: 'wordpress',
    active: true,
  }).sort({ updatedAt: -1 }).lean()
  return NextResponse.json({
    connections: connections.map((connection) => {
      const cfg = wordpressConfig(connection.config)
      return {
        id: String(connection._id),
        name: connection.name,
        siteUrl: connection.siteUrl,
        capabilities: cfg.capabilities || {},
        fields: cfg.fields || [],
        registeredAt: cfg.registeredAt || null,
      }
    }),
  })
})
