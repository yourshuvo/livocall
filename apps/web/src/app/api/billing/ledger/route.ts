export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { LedgerEntry } from '@/models/LedgerEntry'
import {
  isResponse,
  parsePagination,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { ledgerToJson } from '@/lib/serialize'

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const GET = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const url = new URL(req.url)
  const { limit } = parsePagination(url, 100, 500)
  await connectMongo()
  const entries = await LedgerEntry.find({ orgId: s.orgId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
  const rows = entries.map(ledgerToJson)
  if (url.searchParams.get('format') === 'csv') {
    const header = ['id', 'kind', 'amountPaisa', 'balanceAfterPaisa', 'description', 'callId', 'provider', 'providerRef', 'createdAt']
    const body =
      [header.join(','), ...rows.map((row) => header.map((key) => csvEscape(row[key as keyof typeof row])).join(','))].join(
        '\n',
      ) + '\n'
    return new NextResponse(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="livocall-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }
  return NextResponse.json({ entries: rows })
})
