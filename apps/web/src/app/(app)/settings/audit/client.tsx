'use client'
import { useEffect, useState } from 'react'
import { Card, CardBody } from '@/components/ui/card'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'

interface AuditEntry {
  id: string
  actorEmail: string
  action: string
  resource: { type?: string; id?: string } | null
  meta: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  createdAt: string | null
}

export function AuditClient() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    ;(async () => {
      try {
        const j = await api.get<{ entries: AuditEntry[] }>('/api/settings/audit')
        setEntries(j.entries)
      } catch (e) {
        toast((e as Error).message, 'error')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Card>
      <CardBody className="p-0">
        <table className="w-full text-[13px]">
          <thead className="bg-bg-subtle/50 text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                When
              </th>
              <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                Actor
              </th>
              <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                Action
              </th>
              <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                Resource
              </th>
              <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                IP
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-fg-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-fg-muted">
                  No activity yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="px-4 py-3 font-mono text-[11px] text-fg-muted">
                  {e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-fg">{e.actorEmail || 'system'}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-fg-muted">
                  {e.resource?.type ? `${e.resource.type} · ${e.resource.id ?? ''}` : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-fg-muted">{e.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}
