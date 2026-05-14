export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Call } from '@/models/Call'
import {
  isResponse,
  parsePagination,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { callToJson } from '@/lib/serialize'

export const GET = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const url = new URL(req.url)
  const { limit } = parsePagination(url, 50, 200)
  const filter: Record<string, unknown> = { orgId: s.orgId }
  const outcome = url.searchParams.get('outcome')
  if (outcome) filter.outcome = outcome
  const direction = url.searchParams.get('direction')
  if (direction) filter.direction = direction
  const agentId = url.searchParams.get('agentId')
  if (agentId) filter.agentId = agentId
  const since = url.searchParams.get('since')
  if (since) {
    const d = new Date(since)
    if (!Number.isNaN(d.getTime())) filter.startedAt = { $gte: d }
  }
  await connectMongo()
  const calls = await Call.find(filter).sort({ startedAt: -1 }).limit(limit).lean()
  return NextResponse.json({ calls: calls.map(callToJson) })
})
