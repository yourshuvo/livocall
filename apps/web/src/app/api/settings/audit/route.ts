export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import {
  isResponse,
  parsePagination,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { AuditLog } from '@/models/AuditLog'

export const GET = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const url = new URL(req.url)
  const { limit } = parsePagination(url, 100, 500)
  await connectMongo()
  const rows = await AuditLog.find({ orgId: s.orgId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
  return NextResponse.json({
    entries: rows.map((r) => ({
      id: String(r._id),
      action: r.action,
      actorEmail: r.actorEmail ?? null,
      resource: r.resource ?? null,
      meta: r.meta ?? {},
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      ip: r.ip ?? null,
      userAgent: r.userAgent ?? null,
    })),
  })
})
