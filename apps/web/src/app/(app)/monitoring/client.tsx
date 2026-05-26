'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api-fetch'
import { fmtDate, fmtDuration, fmtPhoneE164 } from '@/lib/format'
import { useToast } from '@/components/ui/toast'

const LIVE_REFRESH_MS = 2000

export interface MonitoringCall {
  id: string
  agentId: string | null
  fromE164: string
  toE164: string
  startedAt: string | null
  transcript: { role: string; text: string; at: string | null }[]
}

export function MonitoringClient({
  initialCalls,
  agentNames,
}: {
  initialCalls: MonitoringCall[]
  agentNames: Record<string, string>
}) {
  const [calls, setCalls] = useState(initialCalls)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [supervisorTarget, setSupervisorTarget] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem('livocall.supervisorTargetE164') || '',
  )
  const [supervisorDialog, setSupervisorDialog] = useState<{
    callId: string
    action: 'listen' | 'barge'
  } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [pending, start] = useTransition()
  const { toast } = useToast()

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const json = await api.get<{ calls: MonitoringCall[] }>(
          '/api/calls?outcome=in_progress&limit=50',
        )
        if (!cancelled) setCalls(json.calls)
      } catch {
        // Keep the current snapshot visible if polling fails.
      }
    }
    refresh()
    const timer = window.setInterval(refresh, LIVE_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  function supervise(callId: string, action: 'listen' | 'barge') {
    setActionKey(`${callId}:${action}`)
    start(async () => {
      try {
        await api.post(`/api/calls/${callId}/supervisor`, { action, targetE164: supervisorTarget })
        window.localStorage.setItem('livocall.supervisorTargetE164', supervisorTarget)
        toast(`${action} requested`, 'success')
        setSupervisorDialog(null)
      } catch (e) {
        toast((e as Error).message, 'error')
      } finally {
        setActionKey(null)
      }
    })
  }

  function hangup(callId: string) {
    setActionKey(`${callId}:hangup`)
    start(async () => {
      try {
        await api.del(`/api/calls/${callId}`)
        setCalls((items) => items.filter((call) => call.id !== callId))
        toast('Hangup requested', 'success')
      } catch (e) {
        toast((e as Error).message, 'error')
      } finally {
        setActionKey(null)
      }
    })
  }

  const agentMap = useMemo(() => agentNames, [agentNames])

  return (
    <>
      <div className="grid gap-4 px-6 py-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="border-line border-b p-5">
            <CardTitle>Active calls</CardTitle>
            <CardDescription>{calls.length} call(s) currently in progress</CardDescription>
          </div>
          <CardBody className="space-y-3">
            {calls.length === 0 ? (
              <p className="text-fg-muted text-[13px]">No live calls right now.</p>
            ) : (
              calls.map((call) => {
                const latest = call.transcript[call.transcript.length - 1]
                const recentTranscript = call.transcript.slice(-4)
                const startedAt = call.startedAt ? new Date(call.startedAt) : null
                const elapsedSec = startedAt
                  ? Math.max(0, Math.round((now - startedAt.getTime()) / 1000))
                  : 0
                const latestAt = latest?.at ? new Date(latest.at) : null
                const latestAgeSec = latestAt
                  ? Math.max(0, Math.round((now - latestAt.getTime()) / 1000))
                  : null
                return (
                  <div key={call.id} className="border-line bg-bg-subtle rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="live">live</Badge>
                          <span className="text-fg-muted font-mono text-[12px]">
                            {fmtPhoneE164(call.fromE164)} {'->'} {fmtPhoneE164(call.toE164)}
                          </span>
                        </div>
                        <p className="text-fg-muted mt-1 text-[13px]">
                          {call.agentId ? agentMap[call.agentId] || 'Agent' : 'Agent'} - started{' '}
                          {startedAt ? fmtDate(startedAt) : 'unknown'} - {fmtDuration(elapsedSec)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(['listen', 'barge'] as const).map((action) => (
                          <Button
                            key={action}
                            size="sm"
                            variant={action === 'barge' ? 'primary' : 'secondary'}
                            disabled={pending}
                            onClick={() => setSupervisorDialog({ callId: call.id, action })}
                          >
                            {actionKey === `${call.id}:${action}`
                              ? 'Working...'
                              : action.charAt(0).toUpperCase() + action.slice(1)}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled
                          title="Private whisper needs a human-agent audio leg"
                        >
                          Whisper soon
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={pending}
                          onClick={() => hangup(call.id)}
                        >
                          {actionKey === `${call.id}:hangup` ? 'Working...' : 'Hang up'}
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/calls/${call.id}`}>Open</Link>
                        </Button>
                      </div>
                    </div>
                    <div className="border-line bg-bg mt-3 rounded border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
                          Live transcript
                        </p>
                        <span className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
                          {latestAgeSec == null ? 'listening' : `${latestAgeSec}s ago`}
                        </span>
                      </div>
                      {recentTranscript.length === 0 ? (
                        <p className="text-fg-muted mt-2 text-[13px]">
                          Waiting for transcript chunks...
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {recentTranscript.map((turn, i) => (
                            <li
                              key={`${turn.at || 'pending'}-${i}`}
                              className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-2"
                            >
                              <span
                                className={[
                                  'mt-0.5 h-5 rounded border px-1.5 text-center font-mono text-[10px] uppercase tracking-[0.08em]',
                                  turn.role === 'agent'
                                    ? 'border-status-live/40 text-status-live'
                                    : turn.role === 'user'
                                      ? 'border-line text-fg'
                                      : 'border-line text-fg-muted',
                                ].join(' ')}
                              >
                                {turn.role}
                              </span>
                              <div className="min-w-0">
                                <p className="text-fg text-[13px] leading-relaxed">{turn.text}</p>
                                {turn.at && (
                                  <p className="text-fg-faint mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em]">
                                    {new Date(turn.at).toLocaleTimeString()}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </CardBody>
        </Card>
        <Card>
          <div className="border-line border-b p-5">
            <CardTitle>Supervisor controls</CardTitle>
            <CardDescription>Voice-service integration contract</CardDescription>
          </div>
          <CardBody className="text-fg-muted space-y-3 text-[13px]">
            {[
              'Live transcript stream from /api/internal/voice-event',
              'Listen: subscribe supervisor to call audio',
              'Whisper: coming next with a dedicated human-agent audio leg',
              'Barge: bridge supervisor into both legs',
              'Audit every intervention with call id and supervisor id',
            ].map((item) => (
              <div key={item} className="flex gap-2">
                <Icon name="check" size="xs" className="text-status-live mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
      <Dialog
        open={Boolean(supervisorDialog)}
        onOpenChange={(open) => !open && setSupervisorDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {supervisorDialog?.action === 'barge' ? 'Barge into call' : 'Listen to call'}
            </DialogTitle>
            <p className="text-fg-muted text-[13px]">
              We will dial this supervisor number and attach it to the live call.
            </p>
          </DialogHeader>
          <label className="block">
            <span className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
              Supervisor phone
            </span>
            <input
              value={supervisorTarget}
              onChange={(e) => setSupervisorTarget(e.target.value)}
              placeholder="+8801XXXXXXXXX"
              className="border-line bg-bg text-fg placeholder:text-fg-faint focus:border-fg/40 mt-1 h-10 w-full rounded border px-3 font-mono text-[13px] focus:outline-none"
            />
          </label>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSupervisorDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !/^\+\d{8,15}$/.test(supervisorTarget)}
              onClick={() => {
                if (supervisorDialog) supervise(supervisorDialog.callId, supervisorDialog.action)
              }}
            >
              {supervisorDialog?.action === 'barge' ? 'Barge' : 'Listen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
