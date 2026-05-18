'use client'
import { useState, useTransition } from 'react'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'
import { fmtPhoneE164 } from '@/lib/format'

interface NumberItem {
  id: string
  e164: string
  providerSlug: string
  providerName: string
  didRange: string
  sipServer: string
  sipPort: number
  sipProxy: string
  sipRealm: string
  sipUsername: string
  sipAuthUsername: string
  sipPasswordSet: boolean
  sipRegister: boolean
  sipTransport: 'udp' | 'tcp' | 'tls'
  sipCodecs: string
  agentId: string | null
  inboundEnabled: boolean
  outboundEnabled: boolean
  autoCallback: AutoCallbackConfig
  createdAt: string | null
}

interface AgentRef {
  id: string
  name: string
}

type CallbackOutcome = 'no_answer' | 'busy' | 'failed' | 'voicemail'

interface AutoCallbackConfig {
  enabled: boolean
  eligibleOutcomes: CallbackOutcome[]
  delaySeconds: number
  maxAttempts: number
  retryDelayMinutes: number
  cooldownMinutesPerCaller: number
  maxCallbacksPerDay: number
  quietHours: {
    enabled: boolean
    fromMinutes: number
    toMinutes: number
    timezone: string
  }
}

const CALLBACK_OUTCOMES: { key: CallbackOutcome; label: string }[] = [
  { key: 'no_answer', label: 'No answer' },
  { key: 'busy', label: 'Busy' },
  { key: 'failed', label: 'Failed' },
  { key: 'voicemail', label: 'Voicemail' },
]

export function NumbersClient({
  initial,
  agents,
}: {
  initial: NumberItem[]
  agents: AgentRef[]
}) {
  const [items, setItems] = useState<NumberItem[]>(initial)
  const [creating, setCreating] = useState(false)
  const [providerName, setProviderName] = useState('')
  const [sipServer, setSipServer] = useState('')
  const [sipUsername, setSipUsername] = useState('')
  const [sipPassword, setSipPassword] = useState('')
  const [agentId, setAgentId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [openCallbackFor, setOpenCallbackFor] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { toast } = useToast()

  async function refresh() {
    const j = await api.get<{ numbers: NumberItem[] }>('/api/numbers')
    setItems(j.numbers)
  }

  async function add() {
    setError(null)
    try {
      await api.post('/api/numbers', {
        e164: sipUsername.startsWith('+') ? sipUsername : `+${sipUsername.replace(/\D/g, '')}`,
        providerName: providerName || sipServer,
        didRange: '',
        sipServer,
        sipPort: 5060,
        sipProxy: '',
        sipRealm: sipServer,
        sipUsername,
        sipAuthUsername: sipUsername,
        sipPassword,
        sipRegister: true,
        sipTransport: 'udp',
        sipCodecs: 'PCMU@20ms',
        agentId: agentId || undefined,
        inboundEnabled: true,
        outboundEnabled: true,
      })
      setProviderName('')
      setSipServer('')
      setSipUsername('')
      setSipPassword('')
      setAgentId('')
      setCreating(false)
      toast('SIP provider connected', 'success')
      await refresh()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      toast(msg, 'error')
    }
  }

  function patch(id: string, body: Partial<NumberItem>) {
    startTransition(async () => {
      try {
        await api.patch(`/api/numbers/${id}`, body)
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function patchAutoCallback(number: NumberItem, patchValue: Partial<AutoCallbackConfig>) {
    patch(number.id, { autoCallback: { ...number.autoCallback, ...patchValue } } as Partial<NumberItem>)
  }

  function patchQuietHours(
    number: NumberItem,
    patchValue: Partial<AutoCallbackConfig['quietHours']>,
  ) {
    patchAutoCallback(number, {
      quietHours: { ...number.autoCallback.quietHours, ...patchValue },
    })
  }

  function toggleEligibleOutcome(number: NumberItem, outcome: CallbackOutcome) {
    const current = number.autoCallback.eligibleOutcomes
    const next = current.includes(outcome)
      ? current.filter((item) => item !== outcome)
      : [...current, outcome]
    patchAutoCallback(number, { eligibleOutcomes: next.length ? next : ['no_answer'] })
  }

  function remove(id: string) {
    if (!confirm('Remove this SIP connection? Inbound calls to it will stop bridging to your agents.'))
      return
    startTransition(async () => {
      try {
        await api.del(`/api/numbers/${id}`)
        toast('SIP connection removed', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-fg-muted">{items.length} connected</p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreating((v) => !v)} className="gap-1.5">
            <Icon name="plus" size="sm" />
            {creating ? 'Cancel' : 'Connect SIP'}
          </Button>
        </div>
      </div>

      {creating && (
        <Card>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Connection name (optional)</Label>
              <Input
                className="mt-2"
                placeholder="My SIP provider"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
              />
            </div>
            <div>
              <Label>SIP server / domain</Label>
              <Input
                className="mt-2"
                placeholder="sip.example.com"
                value={sipServer}
                onChange={(e) => setSipServer(e.target.value)}
              />
            </div>
            <div>
              <Label>Phone number (E.164)</Label>
              <Input
                className="mt-2"
                placeholder="+8801711000000"
                value={sipUsername}
                onChange={(e) => setSipUsername(e.target.value)}
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                className="mt-2"
                type="password"
                placeholder="SIP auth password"
                value={sipPassword}
                onChange={(e) => setSipPassword(e.target.value)}
              />
            </div>
            <div>
              <Label>Default agent (optional)</Label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="mt-2 h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm"
              >
                <option value="">-- none --</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="md:col-span-2 text-[12px] text-fg-muted">
              Advanced defaults are applied automatically: UDP, port 5060, registration on, PCMU@20ms.
              Providers that require separate SIP usernames, proxy, or realm can still be edited through API.
            </p>
            {error && <p className="md:col-span-2 text-[13px] text-status-fail">{error}</p>}
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={add}
                disabled={!sipServer || !sipUsername || !sipPassword}
              >
                Connect SIP
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <CardBody className="text-[13px] text-fg-muted">
            No SIP providers connected yet. Add the number, username, password, and server from
            any carrier.
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const callbackBlocked = !n.agentId || !n.outboundEnabled
              const callbackOpen = openCallbackFor === n.id
              return (
              <li
                key={n.id}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-bg-subtle/40"
              >
                <span className="grid size-9 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
                  <Icon name="phone" size="sm" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-fg">{fmtPhoneE164(n.e164)}</p>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">
                    {n.sipServer ? `${n.sipServer}:${n.sipPort || 5060}` : 'server not set'}
                  </p>
                </div>
                <Badge variant="outline">
                  {n.providerName || n.providerSlug}
                </Badge>
                {n.sipPasswordSet && <Badge variant="outline">password saved</Badge>}
                <Badge variant="outline">{n.sipCodecs || 'PCMU@20ms'}</Badge>
                <Badge variant="outline">{n.sipRegister ? 'register' : 'IP auth'}</Badge>
                <select
                  className="h-8 rounded border border-line bg-bg-subtle px-2 text-xs"
                  value={n.agentId ?? ''}
                  onChange={(e) =>
                    patch(n.id, { agentId: e.target.value === '' ? null : e.target.value })
                  }
                  disabled={pending}
                >
                  <option value="">unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-1.5 text-[11.5px]">
                  <input
                    type="checkbox"
                    checked={n.inboundEnabled}
                    onChange={(e) => patch(n.id, { inboundEnabled: e.target.checked })}
                    disabled={pending}
                  />
                  inbound
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11.5px]">
                  <input
                    type="checkbox"
                    checked={n.outboundEnabled}
                    onChange={(e) => patch(n.id, { outboundEnabled: e.target.checked })}
                    disabled={pending}
                  />
                  outbound
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11.5px]">
                  <input
                    type="checkbox"
                    checked={n.autoCallback.enabled}
                    onChange={(e) => patchAutoCallback(n, { enabled: e.target.checked })}
                    disabled={pending || (callbackBlocked && !n.autoCallback.enabled)}
                  />
                  auto callback
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpenCallbackFor(callbackOpen ? null : n.id)}
                >
                  Callback settings
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(n.id)}>
                  Remove
                </Button>
                {callbackOpen && (
                  <div className="basis-full rounded-md border border-line bg-bg p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-fg">Auto callback policy</p>
                        <p className="mt-0.5 text-[12px] text-fg-muted">
                          Calls the missed caller back with this number&apos;s assigned agent.
                        </p>
                      </div>
                      {callbackBlocked && (
                        <Badge variant="outline">
                          {!n.agentId ? 'assign an agent first' : 'enable outbound first'}
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <Label>Callback delay (seconds)</Label>
                        <Input
                          className="mt-2"
                          type="number"
                          min={0}
                          max={86400}
                          value={n.autoCallback.delaySeconds}
                          onChange={(e) =>
                            patchAutoCallback(n, { delaySeconds: Number(e.target.value) || 0 })
                          }
                          disabled={pending}
                        />
                      </div>
                      <div>
                        <Label>Max attempts</Label>
                        <Input
                          className="mt-2"
                          type="number"
                          min={1}
                          max={5}
                          value={n.autoCallback.maxAttempts}
                          onChange={(e) =>
                            patchAutoCallback(n, { maxAttempts: Number(e.target.value) || 1 })
                          }
                          disabled={pending}
                        />
                      </div>
                      <div>
                        <Label>Retry delay (minutes)</Label>
                        <Input
                          className="mt-2"
                          type="number"
                          min={1}
                          max={10080}
                          value={n.autoCallback.retryDelayMinutes}
                          onChange={(e) =>
                            patchAutoCallback(n, {
                              retryDelayMinutes: Number(e.target.value) || 10,
                            })
                          }
                          disabled={pending}
                        />
                      </div>
                      <div>
                        <Label>Daily callback limit</Label>
                        <Input
                          className="mt-2"
                          type="number"
                          min={1}
                          max={10000}
                          value={n.autoCallback.maxCallbacksPerDay}
                          onChange={(e) =>
                            patchAutoCallback(n, {
                              maxCallbacksPerDay: Number(e.target.value) || 50,
                            })
                          }
                          disabled={pending}
                        />
                      </div>
                      <div>
                        <Label>Caller cooldown (minutes)</Label>
                        <Input
                          className="mt-2"
                          type="number"
                          min={0}
                          max={10080}
                          value={n.autoCallback.cooldownMinutesPerCaller}
                          onChange={(e) =>
                            patchAutoCallback(n, {
                              cooldownMinutesPerCaller: Number(e.target.value) || 0,
                            })
                          }
                          disabled={pending}
                        />
                      </div>
                      <div>
                        <Label>Quiet starts</Label>
                        <Input
                          className="mt-2"
                          type="time"
                          value={minutesToTime(n.autoCallback.quietHours.fromMinutes)}
                          onChange={(e) =>
                            patchQuietHours(n, { fromMinutes: timeToMinutes(e.target.value) })
                          }
                          disabled={pending || !n.autoCallback.quietHours.enabled}
                        />
                      </div>
                      <div>
                        <Label>Quiet ends</Label>
                        <Input
                          className="mt-2"
                          type="time"
                          value={minutesToTime(n.autoCallback.quietHours.toMinutes)}
                          onChange={(e) =>
                            patchQuietHours(n, { toMinutes: timeToMinutes(e.target.value) })
                          }
                          disabled={pending || !n.autoCallback.quietHours.enabled}
                        />
                      </div>
                      <div>
                        <Label>Timezone</Label>
                        <Input
                          className="mt-2"
                          value={n.autoCallback.quietHours.timezone}
                          onChange={(e) => patchQuietHours(n, { timezone: e.target.value })}
                          disabled={pending || !n.autoCallback.quietHours.enabled}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 text-[12px]">
                        <input
                          type="checkbox"
                          checked={n.autoCallback.quietHours.enabled}
                          onChange={(e) => patchQuietHours(n, { enabled: e.target.checked })}
                          disabled={pending}
                        />
                        Respect quiet hours
                      </label>
                      <span className="text-[12px] text-fg-muted">Trigger on:</span>
                      {CALLBACK_OUTCOMES.map((outcome) => (
                        <label key={outcome.key} className="inline-flex items-center gap-1.5 text-[12px]">
                          <input
                            type="checkbox"
                            checked={n.autoCallback.eligibleOutcomes.includes(outcome.key)}
                            onChange={() => toggleEligibleOutcome(n, outcome.key)}
                            disabled={pending}
                          />
                          {outcome.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            )})}
          </ul>
        )}
      </Card>
    </div>
  )
}

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

function timeToMinutes(value: string) {
  const [h, m] = value.split(':').map((part) => Number(part))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.max(0, Math.min(1439, h * 60 + m))
}
