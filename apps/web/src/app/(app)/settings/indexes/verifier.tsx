'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-fetch'

interface Result {
  model: string
  ok: boolean
  message: string
}

export function IndexVerifier() {
  const [results, setResults] = useState<Result[]>([])
  const [pending, start] = useTransition()

  function run() {
    start(async () => {
      const j = await api.post<{ results: Result[] }>('/api/admin/indexes')
      setResults(j.results)
    })
  }

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={run} disabled={pending}>
        {pending ? 'Verifying…' : 'Verify and create indexes'}
      </Button>
      {results.length > 0 && (
        <ul className="divide-y divide-line rounded border border-line">
          {results.map((r) => (
            <li key={r.model} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="font-mono text-[12px] text-fg">{r.model}</span>
              <span className="flex items-center gap-2 text-[12px] text-fg-muted">
                {r.message}
                <Badge variant={r.ok ? 'live' : 'fail'}>{r.ok ? 'ok' : 'failed'}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
