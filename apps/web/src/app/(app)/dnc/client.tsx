'use client'
import { useState } from 'react'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-fetch'

interface Entry {
  id: string
  e164: string
  reason: string
  note: string
  createdAt: string
}

export function DncClient({ initial }: { initial: Entry[] }) {
  const [items, setItems] = useState<Entry[]>(initial)
  const [e164, setE164] = useState('')
  const [reason, setReason] = useState('manual')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const j = await api.get<{ entries: Entry[] }>('/api/dnc?limit=500')
    setItems(j.entries)
  }

  async function add() {
    setError(null)
    setLoading(true)
    try {
      await api.post('/api/dnc', { e164, reason, note })
      setE164('')
      setNote('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function remove(num: string) {
    setLoading(true)
    try {
      await api.del(`/api/dnc?e164=${encodeURIComponent(num)}`)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 px-8 py-8">
      <Card>
        <CardBody className="grid gap-3 md:grid-cols-[1fr_180px_1fr_auto]">
          <Input
            placeholder="+8801711000000"
            value={e164}
            onChange={(e) => setE164(e.target.value)}
          />
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-10 rounded border border-line bg-bg-subtle px-3 text-sm"
          >
            <option value="manual">manual</option>
            <option value="user_request">user_request</option>
            <option value="btrc_complaint">btrc_complaint</option>
            <option value="opt_out_keyword">opt_out_keyword</option>
          </select>
          <Input
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button size="sm" onClick={add} disabled={!e164 || loading}>
            Add to DNC
          </Button>
        </CardBody>
      </Card>

      {error && <p className="text-[13px] text-status-fail">{error}</p>}

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line bg-bg-subtle/40 text-fg-faint">
              <tr>
                <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Number
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Reason
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Note
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Added
                </th>
                <th className="w-16 px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-fg-muted">
                    No numbers on the DNC list. Customers who text STOP/UNSUBSCRIBE during a call
                    will appear here automatically.
                  </td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id} className="border-t border-line">
                  <td className="px-4 py-2.5 font-mono">{it.e164}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">{it.reason}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">{it.note}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11.5px] text-fg-faint">
                    {new Date(it.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading}
                      onClick={() => remove(it.e164)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  )
}
