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
import { fmtBdt, fmtDate, fmtDuration, fmtPhoneE164, isBrowserTestCall } from '@/lib/format'
import { tierBadge, tierLabel } from '@/types/agent'
import { cn } from '@/lib/cn'

export const dynamic = 'force-dynamic'

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isMongoConfigured()) notFound()
  const session = await getSession()
  await connectMongo()
  const call = await Call.findOne({ _id: id, orgId: session.orgId }).lean<CallLean>()
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
  const metadata = (
    call.metadata && typeof call.metadata === 'object' ? call.metadata : {}
  ) as Record<string, unknown>
  const latency = (call.latency && typeof call.latency === 'object' ? call.latency : {}) as Record<
    string,
    unknown
  >
  const businessOutcome = call.businessOutcome
  const browserTest = isBrowserTestCall(metadata)

  return (
    <>
      <TopBar
        title={
          browserTest
            ? 'Browser test'
            : `${fmtPhoneE164(call.fromE164)} → ${fmtPhoneE164(call.toE164)}`
        }
        searchPlaceholder="Search transcript..."
        actions={
          <>
            <Link
              href="/calls"
              className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-8 items-center gap-1.5 rounded-[5px] border px-3 text-[12.5px] font-medium transition"
            >
              <Icon name="arrow-right" size="xs" className="rotate-180" /> Back
            </Link>
            {agent && (
              <Link
                href={`/agents/${String(agent._id)}`}
                className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-8 items-center gap-1.5 rounded-[5px] border px-3 text-[12.5px] font-medium transition"
              >
                <Icon name="bot" size="xs" /> {agent.name}
              </Link>
            )}
            {call.audioUrl && (
              <a
                href={call.audioUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#D2D4D6] bg-[#F5F5F7] px-3 text-[12.5px] font-medium text-fg transition hover:bg-[#ECEDEF]"
              >
                <Icon name="speaker" size="xs" /> Recording
              </a>
            )}
            <a
              href={`/api/calls/${String(call._id)}/transcript.txt`}
              download
              className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-8 items-center gap-1.5 rounded-[5px] border px-3 text-[12.5px] font-medium transition"
            >
              <Icon name="globe" size="xs" /> Export transcript
            </a>
          </>
        }
      />

      <div className="bg-bg flex-1 overflow-y-auto">
        <div className="border-line/70 border-b px-6 py-5">
          <p className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.14em]">
            Call · {String(call._id).slice(-6)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={outcomeTone}>{call.outcome}</Badge>
            <Badge variant="outline">{tierLabel[call.tier]}</Badge>
            <Badge variant="outline" className="capitalize">
              {call.direction}
            </Badge>
            {browserTest && <Badge variant="outline">Browser test</Badge>}
            {call.sentiment && (
              <Badge variant="outline" className="capitalize">
                {call.sentiment}
              </Badge>
            )}
            {businessOutcome?.key && (
              <Badge variant={businessOutcome.conversion ? 'live' : 'outline'}>
                {businessOutcome.label || businessOutcome.key}
              </Badge>
            )}
            <span className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
              {fmtDate(call.startedAt)} · {fmtDuration(call.durationSec || 0)}
            </span>
          </div>
          <p className="text-fg-muted mt-2 text-[13px]">
            {call.summary || 'No summary generated for this call.'}
          </p>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <div className="border-line border-b p-5">
              <CardTitle>Transcript</CardTitle>
            </div>
            <CardBody>
              {call.audioUrl && (
                <audio controls src={call.audioUrl} className="mb-4 w-full">
                  <track kind="captions" />
                </audio>
              )}
              {(!call.transcript || call.transcript.length === 0) &&
              (!call.dtmfPath || call.dtmfPath.length === 0) ? (
                <p className="text-fg-muted text-[13px]">No transcript captured for this call.</p>
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
                        <p className="text-fg text-[13px]">{t.text}</p>
                        {t.at && (
                          <p className="text-fg-faint mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em]">
                            {new Date(t.at).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                  {call.dtmfPath && (
                    <li className="border-line bg-bg-subtle rounded-md border p-3">
                      <p className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
                        DTMF path
                      </p>
                      <p className="text-fg mt-1 font-mono text-[12px]">{call.dtmfPath}</p>
                    </li>
                  )}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="space-y-6">
            {businessOutcome?.key && (
              <Card>
                <div className="border-line border-b p-5">
                  <CardTitle>Business outcome</CardTitle>
                </div>
                <CardBody className="text-fg-muted space-y-2 text-[12.5px]">
                  <KV label="Label" value={businessOutcome.label || businessOutcome.key} />
                  <KV label="Key" value={businessOutcome.key} mono />
                  <KV
                    label="Confidence"
                    value={`${Math.round(Number(businessOutcome.confidence ?? 0) * 100)}%`}
                  />
                  <KV label="Conversion" value={businessOutcome.conversion ? 'yes' : 'no'} />
                  {businessOutcome.amountPaisa != null && (
                    <KV label="Amount" value={fmtBdt(Number(businessOutcome.amountPaisa || 0))} />
                  )}
                  {businessOutcome.callbackAt && (
                    <KV label="Callback" value={fmtDate(businessOutcome.callbackAt)} />
                  )}
                  {businessOutcome.callbackE164 && (
                    <KV
                      label="Callback phone"
                      value={fmtPhoneE164(businessOutcome.callbackE164)}
                      mono
                    />
                  )}
                  {businessOutcome.notes && (
                    <div className="border-line mt-2 border-t pt-2">
                      <p className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
                        Notes
                      </p>
                      <p className="text-fg mt-1 text-[13px] leading-relaxed">
                        {businessOutcome.notes}
                      </p>
                    </div>
                  )}
                  {businessOutcome.extractedAt && (
                    <KV label="Extracted" value={fmtDate(businessOutcome.extractedAt)} />
                  )}
                </CardBody>
              </Card>
            )}

            <Card>
              <div className="border-line border-b p-5">
                <CardTitle>Cost</CardTitle>
              </div>
              <CardBody className="space-y-2 text-[13px]">
                <CostRow label="STT" value={cost.sttPaisa || 0} />
                <CostRow label="LLM" value={cost.llmPaisa || 0} />
                <CostRow label="TTS" value={cost.ttsPaisa || 0} />
                <CostRow label="SIP" value={cost.sipPaisa || 0} />
                <div className="border-line mt-2 flex items-center justify-between border-t pt-2">
                  <span className="text-fg font-mono text-[11px] uppercase tracking-[0.12em]">
                    Total
                  </span>
                  <span className="font-display text-fg text-[16px] font-medium">
                    {fmtBdt(cost.totalPaisa || 0)}
                  </span>
                </div>
              </CardBody>
            </Card>

            {call.toolCalls && call.toolCalls.length > 0 && (
              <Card>
                <div className="border-line border-b p-5">
                  <CardTitle>Tool calls</CardTitle>
                </div>
                <CardBody className="space-y-3">
                  {call.toolCalls.map((t, i) => (
                    <div key={i} className="border-line bg-bg-subtle rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-fg font-mono text-[11px]">{t.name}</p>
                        <Badge variant={t.ok ? 'live' : 'fail'}>{t.ok ? 'ok' : 'failed'}</Badge>
                      </div>
                      <pre className="text-fg-muted mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">
                        {JSON.stringify({ arguments: t.arguments, result: t.result }, null, 2)}
                      </pre>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}

            {call.supervisorEvents && call.supervisorEvents.length > 0 && (
              <Card>
                <div className="border-line border-b p-5">
                  <CardTitle>Supervisor events</CardTitle>
                </div>
                <CardBody className="space-y-3">
                  {call.supervisorEvents.map((event, i) => (
                    <div key={i} className="border-line bg-bg-subtle rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-fg font-mono text-[11px] uppercase tracking-[0.12em]">
                          {event.action}
                        </p>
                        <Badge variant={event.ok ? 'live' : 'fail'}>
                          {event.ok ? 'ok' : 'failed'}
                        </Badge>
                      </div>
                      <div className="text-fg-muted mt-2 space-y-1 text-[12px]">
                        <KV label="Target" value={event.targetE164 || '—'} mono />
                        <KV label="Leg UUID" value={event.supervisorLegUuid || '—'} mono />
                        <KV label="At" value={event.at ? fmtDate(event.at) : '—'} />
                        {event.error && <KV label="Error" value={event.error} />}
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}

            <Card>
              <div className="border-line border-b p-5">
                <CardTitle>Metadata</CardTitle>
              </div>
              <CardBody className="text-fg-muted space-y-2 text-[12.5px]">
                <KV label="Tier" value={tierBadge[call.tier]} />
                <KV label="Direction" value={call.direction} />
                {browserTest ? (
                  <KV label="Channel" value="Browser test" />
                ) : (
                  <>
                    <KV label="From" value={fmtPhoneE164(call.fromE164)} mono />
                    <KV label="To" value={fmtPhoneE164(call.toE164)} mono />
                  </>
                )}
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
                <div className="border-line border-b p-5">
                  <CardTitle>Debug</CardTitle>
                </div>
                <CardBody className="text-fg-muted space-y-2 text-[12.5px]">
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
      <span className="text-fg-muted font-mono text-[11px] uppercase tracking-[0.12em]">
        {label}
      </span>
      <span className="text-fg font-mono text-[12px]">{fmtBdt(value)}</span>
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
        {label}
      </span>
      <span
        className={cn('text-fg min-w-0 max-w-[60%] truncate', mono && 'font-mono text-[11.5px]')}
      >
        {value}
      </span>
    </div>
  )
}
