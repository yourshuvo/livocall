import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { TopBar } from '@/components/app/top-bar'
import { StatCard } from '@/components/app/stat-card'
import { EmptyState } from '@/components/app/empty-state'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusDot } from '@/components/ui/status-dot'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Agent, type AgentLean } from '@/models/Agent'
import { Call, type CallLean } from '@/models/Call'
import { browserTestCallLabel, fmtBdt, fmtDuration, fmtDate } from '@/lib/format'
import { tierBadge, tierLabel } from '@/types/agent'
import { CreateAgentButton } from '../agents/create-agent-button'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export default async function OverviewPage() {
  const session = await getSession()
  let agents: AgentLean[] = []
  let recentCalls: CallLean[] = []
  let totalsToday = { count: 0, durationSec: 0, paisa: 0 }
  let totalsPrevious = { count: 0, durationSec: 0, paisa: 0 }
  let metricSeries = {
    calls: Array(8).fill(0) as number[],
    durationSec: Array(8).fill(0) as number[],
    paisa: Array(8).fill(0) as number[],
  }
  let loadError = ''

  if (isMongoConfigured()) {
    try {
      await connectMongo()
      const now = Date.now()
      const since = new Date(now - DAY_MS)
      const previousSince = new Date(now - DAY_MS * 2)
      agents = await Agent.find({ orgId: session.orgId })
        .sort({ updatedAt: -1 })
        .limit(4)
        .lean<AgentLean[]>()
      recentCalls = await Call.find({ orgId: session.orgId })
        .sort({ startedAt: -1 })
        .limit(8)
        .lean<CallLean[]>()
      const windowCalls = await Call.find({
        orgId: session.orgId,
        startedAt: { $gte: previousSince },
      }).lean<CallLean[]>()
      const todays = windowCalls.filter((c) => new Date(c.startedAt).getTime() >= since.getTime())
      const previous = windowCalls.filter((c) => {
        const started = new Date(c.startedAt).getTime()
        return started >= previousSince.getTime() && started < since.getTime()
      })
      totalsToday = todays.reduce(
        (acc, c) => ({
          count: acc.count + 1,
          durationSec: acc.durationSec + (c.durationSec || 0),
          paisa: acc.paisa + (c.cost?.totalPaisa || 0),
        }),
        totalsToday,
      )
      totalsPrevious = previous.reduce(
        (acc, c) => ({
          count: acc.count + 1,
          durationSec: acc.durationSec + (c.durationSec || 0),
          paisa: acc.paisa + (c.cost?.totalPaisa || 0),
        }),
        totalsPrevious,
      )
      metricSeries = buildSeries(todays, now)
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Dashboard data failed to load'
    }
  }

  const liveAgents = agents.filter((a) => a.status === 'live').length

  return (
    <>
      <TopBar
        title="Overview"
        searchPlaceholder="Search agents, calls, numbers..."
        actions={
          <>
            <Link
              href="/calls"
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted"
            >
              <Icon name="phone" size="xs" /> Call log
            </Link>
            <CreateAgentButton className="h-8 rounded-[5px] px-3 text-[12.5px] tracking-normal">
              <Icon name="bot" size="xs" /> New agent
            </CreateAgentButton>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto bg-bg">
        {loadError && (
          <div className="border-b border-status-fail/30 bg-status-fail/5 px-6 py-3 text-[13px] text-status-fail">
            Couldn’t load dashboard data: {loadError}
          </div>
        )}
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
            Workspace
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">
            Hi {session.email?.split('@')[0] || 'there'}
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Your voice agents at a glance — call volume, spend, and what&apos;s happening right now.
          </p>
        </div>
      <div className="grid gap-5 px-6 pt-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Calls (24h)"
          value={String(totalsToday.count)}
          icon="phone"
          delta={delta(totalsToday.count, totalsPrevious.count)}
          series={metricSeries.calls}
          hint="vs previous 24h"
        />
        <StatCard
          label="Talk time (24h)"
          value={fmtDuration(totalsToday.durationSec)}
          icon="clock"
          delta={delta(totalsToday.durationSec, totalsPrevious.durationSec)}
          series={metricSeries.durationSec}
          hint="vs previous 24h"
        />
        <StatCard
          label="Spend (24h)"
          value={fmtBdt(totalsToday.paisa)}
          icon="currency"
          delta={delta(totalsToday.paisa, totalsPrevious.paisa, { lowerIsBetter: true })}
          series={metricSeries.paisa}
          hint="vs previous 24h"
        />
        <StatCard
          label="Live agents"
          value={String(liveAgents)}
          icon="activity"
          delta={{
            value: agents.length > 0 ? `${agents.length} total` : 'no agents',
            positive: liveAgents > 0,
          }}
        />
      </div>

      <div className="grid gap-6 px-6 pb-10 pt-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[14.5px] font-semibold text-fg">Recent calls</h2>
              <Badge variant="outline">latest</Badge>
            </div>
            <Link
              href="/calls"
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
            >
              View all <Icon name="arrow-right" size="xs" square={false} />
            </Link>
          </div>
          <CardBody className="p-0">
            {recentCalls.length === 0 ? (
              <EmptyState
                icon="phone"
                title="No calls yet"
                body="Once your agent goes live and a phone number is attached, calls will land here in real time."
              />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-muted/50 text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Started</th>
                    <th className="px-5 py-3 text-left font-medium">From</th>
                    <th className="px-5 py-3 text-left font-medium">Tier</th>
                    <th className="px-5 py-3 text-left font-medium">Outcome</th>
                    <th className="px-5 py-3 text-right font-medium">Duration</th>
                    <th className="px-5 py-3 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map((c) => (
                    <tr
                      key={String(c._id)}
                      className="border-t border-line transition hover:bg-bg-muted/30"
                    >
                      <td className="px-5 py-3 text-fg-muted">{fmtDate(c.startedAt)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-fg">
                        {browserTestCallLabel(c.metadata) || c.fromE164}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="outline">{tierBadge[c.tier]}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <OutcomeBadge outcome={c.outcome} />
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-fg">
                        {fmtDuration(c.durationSec || 0)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-fg">
                        {fmtBdt(c.cost?.totalPaisa || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-display text-lg text-fg">Your agents</h2>
            <Link
              href="/agents"
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
            >
              View all <Icon name="arrow-right" size="xs" square={false} />
            </Link>
          </div>
          <CardBody className="p-3">
            {agents.length === 0 ? (
              <EmptyState
                icon="bot"
                title="No agents yet"
                body="Spin up your first agent — pick a tier, write a prompt, connect a number."
                action={
                  <CreateAgentButton>Create agent</CreateAgentButton>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {agents.map((a) => (
                  <li key={String(a._id)}>
                    <Link
                      href={`/agents/${a._id}`}
                      className="group flex items-center justify-between gap-3 rounded-md px-3 py-3 transition hover:bg-bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-md border border-line bg-bg-muted/50 font-display text-[15px] text-fg">
                          {a.name.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-display text-[15px] text-fg">{a.name}</p>
                          <p className="truncate text-[11px] uppercase tracking-[0.08em] text-fg-faint">
                            {tierLabel[a.tier]}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.status === 'live' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-live-soft px-2 py-0.5 text-[11px] font-medium text-status-live">
                            <StatusDot tone="live" />
                            live
                          </span>
                        ) : (
                          <Badge variant="outline">{a.status}</Badge>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        </div>
      </div>
    </>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { tone: 'live' | 'warn' | 'fail' | 'outline'; label: string }> = {
    completed: { tone: 'live', label: 'completed' },
    no_answer: { tone: 'warn', label: 'no answer' },
    busy: { tone: 'warn', label: 'busy' },
    failed: { tone: 'fail', label: 'failed' },
    voicemail: { tone: 'outline', label: 'voicemail' },
  }
  const v = map[outcome] || { tone: 'outline' as const, label: outcome }
  return (
    <span className="inline-flex items-center gap-1 text-[12px]">
      {v.tone === 'live' && <Icon name="check" size="sm" square={false} className="text-status-live" />}
      <Badge variant={v.tone}>{v.label}</Badge>
    </span>
  )
}

function buildSeries(calls: CallLean[], now = Date.now()) {
  const start = now - DAY_MS
  const bucketMs = DAY_MS / 8
  const callsSeries = Array(8).fill(0) as number[]
  const durationSeries = Array(8).fill(0) as number[]
  const spendSeries = Array(8).fill(0) as number[]
  for (const call of calls) {
    const started = new Date(call.startedAt).getTime()
    if (!Number.isFinite(started) || started < start || started > now) continue
    const index = Math.min(7, Math.max(0, Math.floor((started - start) / bucketMs)))
    callsSeries[index] += 1
    durationSeries[index] += call.durationSec || 0
    spendSeries[index] += call.cost?.totalPaisa || 0
  }
  return { calls: callsSeries, durationSec: durationSeries, paisa: spendSeries }
}

function delta(current: number, previous: number, opts?: { lowerIsBetter?: boolean }) {
  if (current === 0 && previous === 0) return { value: 'no change', positive: true }
  if (previous === 0) return { value: 'new activity', positive: !opts?.lowerIsBetter || current === 0 }
  const pct = Math.round(((current - previous) / previous) * 100)
  return {
    value: `${pct > 0 ? '+' : ''}${pct}%`,
    positive: opts?.lowerIsBetter ? pct <= 0 : pct >= 0,
  }
}
