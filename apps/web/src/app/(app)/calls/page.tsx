import Link from 'next/link'
import { TopBar } from '@/components/app/top-bar'
import { EmptyState } from '@/components/app/empty-state'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Call, type CallLean } from '@/models/Call'
import { fmtBdt, fmtDate, fmtDuration, fmtPhoneE164 } from '@/lib/format'
import { tierBadge } from '@/types/agent'
import { cn } from '@/lib/cn'
import { CreateAgentButton } from '../agents/create-agent-button'

export const dynamic = 'force-dynamic'

type FilterKey = 'all' | 'inbound' | 'outbound' | 'completed' | 'no_answer' | 'failed'

const FILTERS: { key: FilterKey; label: string; tone?: 'default' | 'live' | 'warn' | 'fail' }[] = [
  { key: 'all', label: 'All' },
  { key: 'inbound', label: 'Inbound' },
  { key: 'outbound', label: 'Outbound' },
  { key: 'completed', label: 'Completed', tone: 'live' },
  { key: 'no_answer', label: 'No answer', tone: 'warn' },
  { key: 'failed', label: 'Failed', tone: 'fail' },
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string; q?: string }>
}) {
  const session = await getSession()
  const resolvedSearchParams = await searchParams
  const filter = (resolvedSearchParams?.filter ?? 'all') as FilterKey
  const q = (resolvedSearchParams?.q ?? '').trim()
  const safeQ = q ? escapeRegExp(q) : ''
  let calls: CallLean[] = []
  let loadError = ''
  if (isMongoConfigured()) {
    try {
      await connectMongo()
      const where: Record<string, unknown> = { orgId: session.orgId }
      if (filter === 'inbound' || filter === 'outbound') where.direction = filter
      if (filter === 'completed' || filter === 'no_answer' || filter === 'failed')
        where.outcome = filter
      if (safeQ) {
        where.$or = [
          { fromE164: { $regex: safeQ, $options: 'i' } },
          { toE164: { $regex: safeQ, $options: 'i' } },
          { summary: { $regex: safeQ, $options: 'i' } },
          { 'businessOutcome.key': { $regex: safeQ, $options: 'i' } },
          { 'businessOutcome.label': { $regex: safeQ, $options: 'i' } },
          { 'businessOutcome.notes': { $regex: safeQ, $options: 'i' } },
          { 'transcript.text': { $regex: safeQ, $options: 'i' } },
          { 'toolCalls.name': { $regex: safeQ, $options: 'i' } },
        ]
      }
      calls = await Call.find(where).sort({ startedAt: -1 }).limit(200).lean<CallLean[]>()
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Calls failed to load'
    }
  }

  const totals = calls.reduce(
    (acc, c) => {
      acc.count += 1
      acc.duration += c.durationSec || 0
      acc.spend += c.cost?.totalPaisa || 0
      if (c.outcome === 'completed') acc.completed += 1
      return acc
    },
    { count: 0, duration: 0, spend: 0, completed: 0 },
  )
  const exportParams = new URLSearchParams()
  if (filter !== 'all') exportParams.set('filter', filter)
  if (q) exportParams.set('q', q)
  const exportHref = `/api/calls/export.csv${exportParams.size ? `?${exportParams}` : ''}`

  return (
    <>
      <TopBar
        title="Call log"
        searchPlaceholder="Search phone or summary..."
        actions={
          <>
            <a
              href={exportHref}
              download
              className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-8 items-center gap-1.5 rounded-[5px] border px-3 text-[12.5px] font-medium transition"
            >
              <Icon name="globe" size="xs" /> Export CSV
            </a>
            <Link
              href="/agents"
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-blue-600 px-3 text-[12.5px] font-medium text-white transition hover:bg-blue-700"
            >
              <Icon name="phone-out" size="xs" /> Test call
            </Link>
          </>
        }
      />

      <div className="bg-bg flex-1 overflow-y-auto">
        {loadError && (
          <div className="border-status-fail/30 bg-status-fail/5 text-status-fail border-b px-6 py-3 text-[13px]">
            Couldn’t load calls: {loadError}
          </div>
        )}
        <div className="grid gap-4 px-6 pt-6 md:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Shown" value={String(totals.count)} icon="phone" hint="latest 200" />
          <SummaryCard
            label="Completed"
            value={String(totals.completed)}
            icon="check-badge"
            hint={
              totals.count ? `${Math.round((totals.completed / totals.count) * 100)}% rate` : '—'
            }
          />
          <SummaryCard
            label="Talk time"
            value={fmtDuration(totals.duration)}
            icon="clock"
            hint="aggregate"
          />
          <SummaryCard
            label="Spend"
            value={fmtBdt(totals.spend)}
            icon="currency"
            hint="paisa-precise"
          />
        </div>

        <div className="px-8 py-8">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.key
              const href = f.key === 'all' ? '/calls' : `/calls?filter=${f.key}`
              return (
                <Link
                  key={f.key}
                  href={
                    href + (q ? `${f.key === 'all' ? '?' : '&'}q=${encodeURIComponent(q)}` : '')
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] transition',
                    active
                      ? 'border-fg/40 bg-fg/5 text-fg'
                      : 'border-line bg-bg text-fg-muted hover:border-fg/30 hover:text-fg',
                  )}
                >
                  {f.tone === 'live' && <span className="bg-status-live size-1.5 rounded-full" />}
                  {f.tone === 'warn' && <span className="bg-status-warn size-1.5 rounded-full" />}
                  {f.tone === 'fail' && <span className="bg-status-fail size-1.5 rounded-full" />}
                  {f.label}
                </Link>
              )
            })}
            <form method="get" action="/calls" className="ml-auto flex items-center gap-2">
              {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search phone or summary"
                className="border-line bg-bg text-fg placeholder:text-fg-faint focus:border-fg/30 rounded-full border px-3 py-1 font-mono text-[11px] focus:outline-none"
              />
            </form>
          </div>

          <Card className="overflow-hidden">
            {calls.length === 0 ? (
              <EmptyState
                icon="phone"
                title="No calls yet"
                body="Once an agent is live and a phone number is attached, every conversation will land here in real time — with transcript, audio replay and per-paisa cost breakdown."
                hint="Tip: tier 3 agents log DTMF paths too"
                action={
                  <CreateAgentButton>Spin up an AI agent</CreateAgentButton>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-bg-subtle/70 text-fg-muted text-[11px] uppercase tracking-[0.08em]">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium">Started</th>
                      <th className="px-5 py-3 text-left font-medium">Direction</th>
                      <th className="px-5 py-3 text-left font-medium">From → To</th>
                      <th className="px-5 py-3 text-left font-medium">Tier</th>
                      <th className="px-5 py-3 text-left font-medium">Outcome</th>
                      <th className="px-5 py-3 text-left font-medium">Business</th>
                      <th className="px-5 py-3 text-right font-medium">Duration</th>
                      <th className="px-5 py-3 text-right font-medium">Cost</th>
                      <th className="px-5 py-3 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((c) => (
                      <tr
                        key={String(c._id)}
                        className="border-line hover:bg-bg-subtle/40 cursor-pointer border-t transition"
                      >
                        <td className="text-fg-muted px-5 py-3">
                          <Link href={`/calls/${c._id}`} className="block">
                            {fmtDate(c.startedAt)}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <DirectionPill direction={c.direction} />
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">
                          <Link href={`/calls/${c._id}`}>
                            <span className="text-fg">{fmtPhoneE164(c.fromE164)}</span>
                            <Icon name="arrow-right" size="xs" className="text-fg-faint mx-1.5" />
                            <span className="text-fg">{fmtPhoneE164(c.toE164)}</span>
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant="outline">{tierBadge[c.tier]}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <OutcomeBadge outcome={c.outcome} />
                        </td>
                        <td className="px-5 py-3">
                          <BusinessOutcomeBadge outcome={c.businessOutcome} />
                        </td>
                        <td className="text-fg px-5 py-3 text-right font-mono text-xs">
                          {fmtDuration(c.durationSec || 0)}
                        </td>
                        <td className="text-fg px-5 py-3 text-right font-mono text-xs">
                          {fmtBdt(c.cost?.totalPaisa || 0)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/calls/${c._id}`}
                            className="border-line bg-bg text-fg-muted hover:border-fg/30 hover:text-fg inline-flex size-7 items-center justify-center rounded-md border transition"
                            aria-label="Open call"
                          >
                            <Icon name="chevron-right" size="sm" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string
  value: string
  icon: 'phone' | 'check-badge' | 'clock' | 'currency'
  hint: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="bg-grid-mono bg-grid-mono-fade pointer-events-none absolute inset-0 opacity-25"
      />
      <CardBody className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-fg-faint font-mono text-[10px] uppercase tracking-[0.14em]">{label}</p>
          <span className="border-line bg-bg-subtle text-fg-muted grid size-7 place-items-center rounded-md border">
            <Icon name={icon} size="sm" />
          </span>
        </div>
        <p className="font-display tracking-tightest text-fg text-[24px] font-medium">{value}</p>
        <p className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">{hint}</p>
      </CardBody>
    </Card>
  )
}

function DirectionPill({ direction }: { direction: 'inbound' | 'outbound' }) {
  const isIn = direction === 'inbound'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        isIn ? 'border-status-live/30 text-status-live' : 'border-line text-fg-muted',
      )}
    >
      <Icon name={isIn ? 'phone-in' : 'phone-out'} size="xs" />
      {direction}
    </span>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { tone: 'live' | 'warn' | 'fail' | 'outline'; label: string }> = {
    completed: { tone: 'live', label: 'completed' },
    no_answer: { tone: 'warn', label: 'no answer' },
    busy: { tone: 'warn', label: 'busy' },
    failed: { tone: 'fail', label: 'failed' },
    voicemail: { tone: 'outline', label: 'voicemail' },
    in_progress: { tone: 'outline', label: 'in progress' },
  }
  const v = map[outcome] || { tone: 'outline' as const, label: outcome }
  return <Badge variant={v.tone}>{v.label}</Badge>
}

function BusinessOutcomeBadge({ outcome }: { outcome: CallLean['businessOutcome'] }) {
  if (!outcome?.key) {
    return <span className="text-fg-faint font-mono text-[11px]">-</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={outcome.conversion ? 'live' : 'outline'}>
        {outcome.label || outcome.key}
      </Badge>
      {outcome.conversion && (
        <span className="text-status-live font-mono text-[10.5px] uppercase tracking-[0.12em]">
          conversion
        </span>
      )}
    </div>
  )
}
