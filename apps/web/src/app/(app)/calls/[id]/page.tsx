import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TopBar } from '@/components/app/top-bar'
import { Card, CardBody, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Call, type CallLean } from '@/models/Call'
import { Agent, type AgentLean } from '@/models/Agent'
import { fmtBdt, fmtDate, fmtDuration, fmtPhoneE164 } from '@/lib/format'
import { tierBadge, tierLabel } from '@/types/agent'
import { cn } from '@/lib/cn'

export const dynamic = 'force-dynamic'

export default async function CallDetailPage({ params }: { params: { id: string } }) {
  if (!isMongoConfigured()) notFound()
  const session = await getSession()
  await connectMongo()
  const call = await Call.findOne({ _id: params.id, orgId: session.orgId }).lean<CallLean>()
  if (!call) notFound()
  const agent = call.agentId
    ? await Agent.findOne({ _id: call.agentId, orgId: session.orgId }).lean<AgentLean>()
    : null

  const outcomeTone =
    call.outcome === 'completed'
      ? 'live'
      : call.outcome === 'failed'
        ? 'fail'
        : call.outcome === 'in_progress'
          ? 'outline'
          : 'warn'

  const cost = call.cost || {
    sttPaisa: 0,
    llmPaisa: 0,
    ttsPaisa: 0,
    sipPaisa: 0,
    totalPaisa: 0,
  }
  const metadata = (call.metadata && typeof call.metadata === 'object' ? call.metadata : {}) as Record<string, unknown>
  const latency = (call.latency && typeof call.latency === 'object' ? call.latency : {}) as Record<string, unknown>

  return (
    <>
      <TopBar
        title={`${fmtPhoneE164(call.fromE164)} → ${fmtPhoneE164(call.toE164)}`}
        searchPlaceholder="Search transcript..."
        actions={
          <>
            <Link
              href="/calls"
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted"
            >
              <Icon name="arrow-right" size="xs" className="rotate-180" /> Back
            </Link>
            {agent && (
              <Link
                href={`/agents/${String(agent._id)}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted"
              >
                <Icon name="bot" size="xs" /> {agent.name}
              </Link>
            )}
            {call.audioUrl && (
              <a
                href={call.audioUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-fg px-3 text-[12.5px] font-medium text-fg-inverse transition hover:bg-fg-strong"
              >
                <Icon name="speaker" size="xs" /> Recording
              </a>
            )}
            <a
              href={`/api/calls/${String(call._id)}/transcript.txt`}
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted"
            >
              <Icon name="globe" size="xs" /> Export transcript
            </a>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto bg-bg">
      <div className="border-b border-line/70 px-6 py-5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
          Call · {String(call._id).slice(-6)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={outcomeTone}>{call.outcome}</Badge>
          <Badge variant="outline">{tierLabel[call.tier]}</Badge>
          <Badge variant="outline" className="capitalize">
            {call.direction}
          </Badge>
          {call.sentiment && (
            <Badge variant="outline" className="capitalize">
              {call.sentiment}
            </Badge>
          )}
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">
            {fmtDate(call.startedAt)} · {fmtDuration(call.durationSec || 0)}
          </span>
        </div>
        <p className="mt-2 text-[13px] text-fg-muted">
          {call.summary || 'No summary generated for this call.'}
        </p>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="border-b border-line p-5">
            <CardTitle>Transcript</CardTitle>
          </div>
          <CardBody>
            {call.audioUrl && (
              <audio controls src={call.audioUrl} className="mb-4 w-full">
                <track kind="captions" />
              </audio>
            )}
            {(!call.transcript || call.transcript.length === 0) && (!call.dtmfPath || call.dtmfPath.length === 0) ? (
              <p className="text-[13px] text-fg-muted">
                No transcript captured for this call.
              </p>
            ) : (
              <ul className="space-y-3">
                {(call.transcript || []).map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <div
                      className={cn(
                        'mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full border px-2 font-mono text-[10px] uppercase tracking-[0.12em]',
                        t.role === 'agent'
                          ? 'border-status-live/40 text-status-live'
                          : t.role === 'user'
                            ? 'border-line text-fg'
                            : 'border-line text-fg-muted',
                      )}
                    >
                      {t.role}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-fg">{t.text}</p>
                      {t.at && (
                        <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">
                          {new Date(t.at).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
                {call.dtmfPath && (
                  <li className="rounded-md border border-line bg-bg-subtle p-3">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">
                      DTMF path
                    </p>
                    <p className="mt-1 font-mono text-[12px] text-fg">{call.dtmfPath}</p>
                  </li>
                )}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="border-b border-line p-5">
              <CardTitle>Cost</CardTitle>
            </div>
            <CardBody className="space-y-2 text-[13px]">
              <CostRow label="STT" value={cost.sttPaisa || 0} />
              <CostRow label="LLM" value={cost.llmPaisa || 0} />
              <CostRow label="TTS" value={cost.ttsPaisa || 0} />
              <CostRow label="SIP" value={cost.sipPaisa || 0} />
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg">
                  Total
                </span>
                <span className="font-display text-[16px] font-medium text-fg">
                  {fmtBdt(cost.totalPaisa || 0)}
                </span>
              </div>
            </CardBody>
          </Card>

          {call.toolCalls && call.toolCalls.length > 0 && (
            <Card>
              <div className="border-b border-line p-5">
                <CardTitle>Tool calls</CardTitle>
              </div>
              <CardBody className="space-y-3">
                {call.toolCalls.map((t, i) => (
                  <div key={i} className="rounded-md border border-line bg-bg-subtle p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[11px] text-fg">{t.name}</p>
                      <Badge variant={t.ok ? 'live' : 'fail'}>{t.ok ? 'ok' : 'failed'}</Badge>
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-fg-muted">
                      {JSON.stringify({ arguments: t.arguments, result: t.result }, null, 2)}
                    </pre>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <div className="border-b border-line p-5">
              <CardTitle>Metadata</CardTitle>
            </div>
            <CardBody className="space-y-2 text-[12.5px] text-fg-muted">
              <KV label="Tier" value={tierBadge[call.tier]} />
              <KV label="Direction" value={call.direction} />
              <KV label="From" value={fmtPhoneE164(call.fromE164)} mono />
              <KV label="To" value={fmtPhoneE164(call.toE164)} mono />
              <KV label="Started" value={fmtDate(call.startedAt)} />
              <KV label="Ended" value={call.endedAt ? fmtDate(call.endedAt) : '—'} />
              <KV label="Duration" value={fmtDuration(call.durationSec || 0)} />
              <KV label="Agent" value={agent ? agent.name : '—'} />
              <KV label="FS UUID" value={call.fsUuid || '—'} mono />
              <KV label="Hangup cause" value={call.hangupCause || '—'} />
              <KV label="Call ID" value={String(call._id)} mono />
            </CardBody>
          </Card>

          {(Object.keys(metadata).length > 0 || Object.keys(latency).length > 0) && (
            <Card>
              <div className="border-b border-line p-5">
                <CardTitle>Debug</CardTitle>
              </div>
              <CardBody className="space-y-2 text-[12.5px] text-fg-muted">
                {Object.entries(metadata).map(([k, v]) => (
                  <KV key={`meta-${k}`} label={k} value={String(v)} mono />
                ))}
                {Object.entries(latency).map(([k, v]) => (
                  <KV key={`lat-${k}`} label={k} value={String(v)} mono />
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
      </div>
    </>
  )
}

function CostRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-muted">
        {label}
      </span>
      <span className="font-mono text-[12px] text-fg">{fmtBdt(value)}</span>
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">
        {label}
      </span>
      <span className={cn('min-w-0 max-w-[60%] truncate text-fg', mono && 'font-mono text-[11.5px]')}>
        {value}
      </span>
    </div>
  )
}
