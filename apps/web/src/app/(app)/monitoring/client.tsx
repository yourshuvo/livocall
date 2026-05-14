'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'
import { fmtDate, fmtDuration, fmtPhoneE164 } from '@/lib/format'
import { useToast } from '@/components/ui/toast'

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
  const [pending, start] = useTransition()
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const json = await api.get<{ calls: MonitoringCall[] }>('/api/calls?outcome=in_progress&limit=50')
        if (!cancelled) setCalls(json.calls)
      } catch {
        // Keep the current snapshot visible if polling fails.
      }
    }
    const timer = window.setInterval(refresh, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  function supervise(callId: string, action: 'listen' | 'whisper' | 'barge') {
    setActionKey(`${callId}:${action}`)
    start(async () => {
      try {
        await api.post(`/api/calls/${callId}/supervisor`, { action })
        toast(`${action} requested`, 'success')
      } catch (e) {
        toast((e as Error).message, 'error')
      } finally {
        setActionKey(null)
      }
    })
  }

  const agentMap = useMemo(() => agentNames, [agentNames])

  return (
    <div className="grid gap-4 px-6 py-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <div className="border-b border-line p-5">
          <CardTitle>Active calls</CardTitle>
          <CardDescription>{calls.length} call(s) currently in progress</CardDescription>
        </div>
        <CardBody className="space-y-3">
          {calls.length === 0 ? (
            <p className="text-[13px] text-fg-muted">No live calls right now.</p>
          ) : (
            calls.map((call) => {
              const latest = call.transcript[call.transcript.length - 1]
              const startedAt = call.startedAt ? new Date(call.startedAt) : null
              const elapsedSec = startedAt
                ? Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000))
                : 0
              return (
                <div key={call.id} className="rounded-lg border border-line bg-bg-subtle p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="live">live</Badge>
                        <span className="font-mono text-[12px] text-fg-muted">
                          {fmtPhoneE164(call.fromE164)} {'->'} {fmtPhoneE164(call.toE164)}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-fg-muted">
                        {call.agentId ? agentMap[call.agentId] || 'Agent' : 'Agent'} - started{' '}
                        {startedAt ? fmtDate(startedAt) : 'unknown'} - {fmtDuration(elapsedSec)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['listen', 'whisper', 'barge'] as const).map((action) => (
                        <Button
                          key={action}
                          size="sm"
                          variant={action === 'barge' ? 'primary' : 'secondary'}
                          disabled={pending}
                          onClick={() => supervise(call.id, action)}
                        >
                          {actionKey === `${call.id}:${action}`
                            ? 'Working...'
                            : action.charAt(0).toUpperCase() + action.slice(1)}
                        </Button>
                      ))}
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/calls/${call.id}`}>Open</Link>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 rounded border border-line bg-bg p-3">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">
                      Latest transcript
                    </p>
                    <p className="mt-1 text-[13px] text-fg">
                      {latest ? `${latest.role}: ${latest.text}` : 'Waiting for transcript chunks...'}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </CardBody>
      </Card>
      <Card>
        <div className="border-b border-line p-5">
          <CardTitle>Supervisor controls</CardTitle>
          <CardDescription>Voice-service integration contract</CardDescription>
        </div>
        <CardBody className="space-y-3 text-[13px] text-fg-muted">
          {[
            'Live transcript stream from /api/internal/voice-event',
            'Listen: subscribe supervisor to call audio',
            'Whisper: send supervisor audio to agent only',
            'Barge: bridge supervisor into both legs',
            'Audit every intervention with call id and supervisor id',
          ].map((item) => (
            <div key={item} className="flex gap-2">
              <Icon name="check" size="xs" className="mt-0.5 text-status-live" />
              <span>{item}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
