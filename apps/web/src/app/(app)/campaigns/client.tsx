'use client'
import { useRef, useState, useTransition } from 'react'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'
import { parseContactsCsv } from '@/lib/csv'

interface Camp {
  id: string
  name: string
  status: string
  agentId: string
  concurrency: number
  maxAttempts: number
  fromE164: string
  contactIds: string[]
  schedule?: {
    timezone?: string
    windows?: { from: number; to: number }[]
  } | null
  retryRules?: {
    noAnswerDelayMin?: number
    busyDelayMin?: number
    failedDelayMin?: number
    voicemailRetry?: boolean
  } | null
  leadScoring?: {
    enabled?: boolean
    minScore?: number
    scoreField?: string
  } | null
  autoStopGoals?: {
    completedCalls?: number
    conversionRatePct?: number
    maxSpendPaisa?: number
  } | null
  stats?: {
    total?: number
    attempted?: number
    completed?: number
    failed?: number
    noAnswer?: number
  } | null
  createdAt: string
}

interface Agent {
  id: string
  name: string
  tier: string
}

interface NumberOption {
  id: string
  e164: string
  providerName: string
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return Math.max(0, Math.min(1440, (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)))
}

function formatWindow(window?: { from: number; to: number }): string {
  if (!window) return '09:00-18:00'
  const fmt = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
  return `${fmt(window.from)}-${fmt(window.to)}`
}

export function CampaignsClient({
  initialCampaigns,
  agents,
  numbers,
}: {
  initialCampaigns: Camp[]
  agents: Agent[]
  numbers: NumberOption[]
}) {
  const [items, setItems] = useState<Camp[]>(initialCampaigns)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [concurrency, setConcurrency] = useState(5)
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [fromE164, setFromE164] = useState('')
  const [timezone, setTimezone] = useState('Asia/Dhaka')
  const [windowFrom, setWindowFrom] = useState('09:00')
  const [windowTo, setWindowTo] = useState('18:00')
  const [noAnswerDelayMin, setNoAnswerDelayMin] = useState(60)
  const [busyDelayMin, setBusyDelayMin] = useState(30)
  const [failedDelayMin, setFailedDelayMin] = useState(240)
  const [leadMinScore, setLeadMinScore] = useState(0)
  const [autoStopCompleted, setAutoStopCompleted] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [importingId, setImportingId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const { toast } = useToast()

  async function importContacts(campId: string, file: File) {
    setImportingId(campId)
    try {
      const text = await file.text()
      const rows = parseContactsCsv(text)
      if (rows.length === 0) {
        toast('No valid contacts in CSV (expect `phone` or `e164` column)', 'error')
        return
      }
      const r = await api.post<{ imported: number; total: number }>(
        `/api/campaigns/${campId}/contacts`,
        { contacts: rows },
      )
      toast(`${r.imported} contact(s) imported — total ${r.total}`, 'success')
      await refresh()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setImportingId(null)
    }
  }

  async function refresh() {
    const j = await api.get<{ campaigns: Camp[] }>('/api/campaigns')
    setItems(j.campaigns)
  }

  async function create() {
    setError(null)
    try {
      await api.post('/api/campaigns', {
        name,
        agentId,
        concurrency,
        maxAttempts,
        ...(fromE164 ? { fromE164 } : {}),
        schedule: {
          timezone,
          windows: [{ from: timeToMinutes(windowFrom), to: timeToMinutes(windowTo) }],
        },
        retryRules: {
          noAnswerDelayMin,
          busyDelayMin,
          failedDelayMin,
          voicemailRetry: true,
        },
        leadScoring: {
          enabled: leadMinScore > 0,
          minScore: leadMinScore,
          scoreField: 'score',
        },
        autoStopGoals: {
          completedCalls: autoStopCompleted,
          conversionRatePct: 0,
          maxSpendPaisa: 0,
        },
        contactIds: [],
      })
      setName('')
      setCreating(false)
      setFromE164('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function setStatus(id: string, action: 'start' | 'pause') {
    startTransition(async () => {
      try {
        await api.post(`/api/campaigns/${id}/${action}`)
        await refresh()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  async function remove(id: string) {
    startTransition(async () => {
      try {
        await api.del(`/api/campaigns/${id}`)
        await refresh()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-fg-muted">{items.length} campaign(s)</p>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : 'New campaign'}
        </Button>
      </div>

      {creating && (
        <Card className="mb-6">
          <CardBody className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Agent</span>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.tier})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Concurrency</span>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Max attempts</span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">From number</span>
                <select
                  value={fromE164}
                  onChange={(e) => setFromE164(e.target.value)}
                  className="h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm"
                >
                  <option value="">Auto-select outbound number</option>
                  {numbers.map((n) => (
                    <option key={n.id} value={n.e164}>
                      {n.e164} {n.providerName ? `· ${n.providerName}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Timezone</span>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Call window</span>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" value={windowFrom} onChange={(e) => setWindowFrom(e.target.value)} />
                  <Input type="time" value={windowTo} onChange={(e) => setWindowTo(e.target.value)} />
                </div>
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">No-answer retry delay (min)</span>
                <Input type="number" min={1} value={noAnswerDelayMin} onChange={(e) => setNoAnswerDelayMin(Number(e.target.value))} />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Busy retry delay (min)</span>
                <Input type="number" min={1} value={busyDelayMin} onChange={(e) => setBusyDelayMin(Number(e.target.value))} />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Failed retry delay (min)</span>
                <Input type="number" min={1} value={failedDelayMin} onChange={(e) => setFailedDelayMin(Number(e.target.value))} />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Minimum lead score</span>
                <Input type="number" min={0} max={100} value={leadMinScore} onChange={(e) => setLeadMinScore(Number(e.target.value))} />
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-fg-muted">Auto-stop after completions</span>
                <Input type="number" min={0} value={autoStopCompleted} onChange={(e) => setAutoStopCompleted(Number(e.target.value))} />
              </label>
            </div>
            {error && <p className="text-[13px] text-status-fail">{error}</p>}
            <div className="flex justify-end">
              <Button size="sm" onClick={create} disabled={!name || !agentId}>
                Create campaign
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-3">
        {items.length === 0 && (
          <Card>
            <CardBody className="text-[13px] text-fg-muted">
              No campaigns yet. Create one to dial a contact list.
            </CardBody>
          </Card>
        )}
        {items.map((c) => (
          <Card key={c.id}>
            <CardBody className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-fg">{c.name}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
                  Concurrency {c.concurrency} · max {c.maxAttempts} attempts ·{' '}
                  {c.contactIds.length} contacts
                </p>
                {c.fromE164 && (
                  <p className="mt-0.5 font-mono text-[11px] text-fg-faint">From {c.fromE164}</p>
                )}
                <p className="mt-0.5 font-mono text-[11px] text-fg-faint">
                  Window {formatWindow(c.schedule?.windows?.[0])} · retry no-answer {c.retryRules?.noAnswerDelayMin ?? 60}m · min score {c.leadScoring?.minScore ?? 0}
                  {c.autoStopGoals?.completedCalls ? ` · stop at ${c.autoStopGoals.completedCalls} completions` : ''}
                </p>
                {c.stats && (
                  <p className="mt-1 text-[12px] text-fg-muted">
                    {c.stats.completed ?? 0} completed · {c.stats.failed ?? 0} failed ·{' '}
                    {c.stats.noAnswer ?? 0} no-answer · {c.stats.attempted ?? 0}/
                    {c.stats.total ?? 0} attempted
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={c.status === 'running' ? 'live' : 'default'}>{c.status}</Badge>
                {c.status === 'draft' || c.status === 'paused' ? (
                  <Button
                    size="sm"
                    disabled={pending || c.contactIds.length === 0}
                    title={c.contactIds.length === 0 ? 'Import contacts before starting' : undefined}
                    onClick={() => setStatus(c.id, 'start')}
                  >
                    Start
                  </Button>
                ) : null}
                {c.status === 'running' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setStatus(c.id, 'pause')}
                  >
                    Pause
                  </Button>
                ) : null}
                <input
                  ref={(el) => {
                    fileRefs.current[c.id] = el
                  }}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) importContacts(c.id, file)
                    e.target.value = ''
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={importingId === c.id || c.status === 'running'}
                  onClick={() => fileRefs.current[c.id]?.click()}
                >
                  {importingId === c.id ? 'Importing…' : 'Import CSV'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || c.status === 'running'}
                  onClick={() => remove(c.id)}
                >
                  Delete
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}
