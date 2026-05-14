import { TopBar } from '@/components/app/top-bar'
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Call, type CallLean } from '@/models/Call'
import { Campaign, type CampaignLean } from '@/models/Campaign'
import { KnowledgeBase, type KnowledgeBaseLean } from '@/models/KnowledgeBase'
import { fmtBdt } from '@/lib/format'

export const dynamic = 'force-dynamic'

function average(values: number[]): number {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
}

export default async function AnalyticsPage() {
  const session = await getSession()
  let calls: CallLean[] = []
  let campaigns: CampaignLean[] = []
  let kbs: KnowledgeBaseLean[] = []
  let loadError = ''
  if (isMongoConfigured()) {
    try {
      await connectMongo()
      ;[calls, campaigns, kbs] = await Promise.all([
        Call.find({ orgId: session.orgId }).sort({ startedAt: -1 }).limit(1000).lean<CallLean[]>(),
        Campaign.find({ orgId: session.orgId }).sort({ updatedAt: -1 }).limit(100).lean<CampaignLean[]>(),
        KnowledgeBase.find({ orgId: session.orgId }).lean<KnowledgeBaseLean[]>(),
      ])
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Analytics data failed to load'
    }
  }

  const completed = calls.filter((c) => c.outcome === 'completed').length
  const spend = calls.reduce((sum, c) => sum + (c.cost?.totalPaisa || 0), 0)
  const toolCalls = calls.flatMap((c) => c.toolCalls ?? [])
  const toolSuccess = toolCalls.length ? Math.round((toolCalls.filter((t) => t.ok).length / toolCalls.length) * 100) : 0
  const latencyMs = average(
    calls
      .map((c) => {
        const latency = c.latency && typeof c.latency === 'object' ? (c.latency as Record<string, unknown>) : {}
        const value = latency.totalMs ?? latency.firstTokenMs ?? latency.sttMs
        return typeof value === 'number' ? value : 0
      })
      .filter(Boolean),
  )
  const unansweredKb = calls.filter((c) => /do not know|don't know|unknown|not sure/i.test(c.summary || '')).length
  const campaignTotal = campaigns.reduce((sum, c) => sum + (c.stats?.total || 0), 0)
  const campaignAttempted = campaigns.reduce((sum, c) => sum + (c.stats?.attempted || 0), 0)
  const campaignCompleted = campaigns.reduce((sum, c) => sum + (c.stats?.completed || 0), 0)
  const campaignSpend = campaignSpendById(calls)

  return (
    <>
      <TopBar title="Analytics" searchPlaceholder="Search metrics..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        {loadError && (
          <div className="border-b border-status-fail/30 bg-status-fail/5 px-6 py-3 text-[13px] text-status-fail">
            Couldn’t load analytics data: {loadError}
          </div>
        )}
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Metrics</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Analytics dashboard</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Latency, cost, KB gaps, tool reliability, and campaign conversion funnel.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4">
          <Metric title="Avg latency" value={latencyMs ? `${latencyMs}ms` : '—'} detail="from call latency metadata" />
          <Metric title="Cost / call" value={calls.length ? fmtBdt(Math.round(spend / calls.length)) : '—'} detail={`${fmtBdt(spend)} total`} />
          <Metric title="Tool success" value={toolCalls.length ? `${toolSuccess}%` : '—'} detail={`${toolCalls.length} tool calls`} />
          <Metric title="KB unanswered" value={String(unansweredKb)} detail={`${kbs.length} knowledge bases`} />
        </div>
        <div className="grid gap-4 px-6 pb-8 lg:grid-cols-2">
          <Card>
            <div className="border-b border-line p-5">
              <CardTitle>Conversion funnel</CardTitle>
              <CardDescription>Campaign leads → completed conversations</CardDescription>
            </div>
            <CardBody className="space-y-3">
              {[
                ['Leads loaded', campaignTotal],
                ['Calls attempted', campaignAttempted],
                ['Completed', campaignCompleted],
                ['Completed calls (all)', completed],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded border border-line bg-bg-subtle px-3 py-2">
                  <span className="text-[13px] text-fg-muted">{label}</span>
                  <Badge variant="outline">{value}</Badge>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <div className="border-b border-line p-5">
              <CardTitle>Cost by campaign</CardTitle>
              <CardDescription>Uses linked call metadata from the latest 1,000 calls</CardDescription>
            </div>
            <CardBody className="space-y-3">
              {campaigns.length === 0 ? (
                <p className="text-[13px] text-fg-muted">No campaign data yet.</p>
              ) : (
                campaigns.slice(0, 8).map((c) => (
                  <div key={String(c._id)} className="flex items-center justify-between rounded border border-line bg-bg-subtle px-3 py-2">
                    <span className="text-[13px] text-fg">{c.name}</span>
                    <span className="text-[12px] text-fg-muted">
                      {fmtBdt(campaignSpend.get(String(c._id)) ?? 0)} spent · {c.stats?.completed || 0} completed
                    </span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

function campaignSpendById(calls: CallLean[]) {
  const spendById = new Map<string, number>()
  for (const call of calls) {
    const metadata = call.metadata && typeof call.metadata === 'object'
      ? (call.metadata as Record<string, unknown>)
      : {}
    const campaignId = typeof metadata.campaignId === 'string' ? metadata.campaignId : ''
    if (!campaignId) continue
    spendById.set(campaignId, (spendById.get(campaignId) ?? 0) + (call.cost?.totalPaisa || 0))
  }
  return spendById
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card>
      <CardBody>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">{title}</p>
        <p className="mt-2 font-display text-2xl text-fg">{value}</p>
        <p className="mt-1 text-[12px] text-fg-muted">{detail}</p>
      </CardBody>
    </Card>
  )
}
