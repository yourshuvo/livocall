import { NextResponse } from 'next/server'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Call, type CallLean } from '@/models/Call'
import { Org } from '@/models/Org'

export const dynamic = 'force-dynamic'

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!isMongoConfigured()) {
    return new NextResponse('', { status: 503 })
  }
  const url = new URL(req.url)
  const filter = url.searchParams.get('filter') ?? 'all'
  const q = (url.searchParams.get('q') ?? '').trim()
  await connectMongo()
  if (session.role === 'agent') {
    const org = await Org.findById(session.orgId).lean()
    if (org?.compliance?.agentRoleCanExport !== true) {
      return new NextResponse('forbidden', { status: 403 })
    }
  }
  const where: Record<string, unknown> = { orgId: session.orgId }
  if (filter === 'inbound' || filter === 'outbound') where.direction = filter
  if (filter === 'completed' || filter === 'no_answer' || filter === 'failed')
    where.outcome = filter
  if (q) {
    const safeQ = escapeRegExp(q)
    where.$or = [
      { fromE164: { $regex: safeQ, $options: 'i' } },
      { toE164: { $regex: safeQ, $options: 'i' } },
      { summary: { $regex: safeQ, $options: 'i' } },
    ]
  }
  const calls = await Call.find(where).sort({ startedAt: -1 }).limit(10_000).lean<CallLean[]>()
  const header = [
    'id',
    'startedAt',
    'endedAt',
    'direction',
    'fromE164',
    'toE164',
    'tier',
    'outcome',
    'durationSec',
    'totalPaisa',
    'summary',
  ]
  const rows = calls.map((c) =>
    [
      String(c._id),
      c.startedAt ? new Date(c.startedAt).toISOString() : '',
      c.endedAt ? new Date(c.endedAt).toISOString() : '',
      c.direction,
      c.fromE164,
      c.toE164,
      c.tier,
      c.outcome,
      c.durationSec ?? 0,
      c.cost?.totalPaisa ?? 0,
      c.summary ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )
  const body = [header.join(','), ...rows].join('\n') + '\n'
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="livocall-calls-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
