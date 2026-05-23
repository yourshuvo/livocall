'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-fetch'

const SCOPES = [
  'calls:read',
  'calls:write',
  'campaigns:read',
  'campaigns:write',
  'agents:read',
  'agents:write',
  'contacts:read',
  'contacts:write',
  'knowledge:read',
  'knowledge:write',
  'numbers:read',
  'numbers:write',
  'billing:read',
  'dnc:read',
  'dnc:write',
  '*',
] as const

const EVENTS = [
  'call.started',
  'call.completed',
  'call.failed',
  'call.transferred',
  'agent.updated',
  'topup.confirmed',
  'campaign.completed',
] as const

interface Key {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
}

interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  createdAt: string
}

interface KeyCreated {
  id: string
  prefix: string
  plaintext: string
  scopes: string[]
}

interface HookCreated {
  id: string
  url: string
  events: string[]
  secret: string
}

const ENDPOINTS: Array<{
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  scope: string
  desc: string
  body?: string
  reply?: string
}> = [
  {
    method: 'POST',
    path: '/api/v1/calls',
    scope: 'calls:write',
    desc: 'Originate an outbound call. Returns the new call id and FreeSWITCH UUID.',
    body: `{
  "agent_id": "65a1...",
  "to_e164": "+8801711000000",
  "from_e164": "+8809610000000",
  "metadata": { "campaign": "may_promo" }
}`,
    reply: `{ "callId": "65a1...", "fsUuid": "9f3e...", "queued": true }`,
  },
  {
    method: 'GET',
    path: '/api/v1/calls?limit=50',
    scope: 'calls:read',
    desc: 'List recent calls. Filter with ?outcome=, ?limit=.',
  },
  {
    method: 'GET',
    path: '/api/v1/calls/{id}',
    scope: 'calls:read',
    desc: 'Fetch one call (full transcript, cost, outcome).',
  },
  {
    method: 'DELETE',
    path: '/api/v1/calls/{id}',
    scope: 'calls:write',
    desc: 'Hang up an in-progress call.',
  },
  {
    method: 'GET',
    path: '/api/v1/agents',
    scope: 'agents:read',
    desc: 'List your agents.',
  },
  {
    method: 'GET',
    path: '/api/v1/dnc',
    scope: 'dnc:read',
    desc: 'List the org do-not-call entries.',
  },
  {
    method: 'POST',
    path: '/api/v1/dnc',
    scope: 'dnc:write',
    desc: 'Add a number to the do-not-call list. Honoured immediately by every dial-out.',
    body: `{
  "e164": "+8801711000000",
  "reason": "user_request",
  "note": "Asked to be removed during call abc123"
}`,
  },
  {
    method: 'DELETE',
    path: '/api/v1/dnc?e164=%2B8801711000000',
    scope: 'dnc:write',
    desc: 'Remove a number from the DNC list.',
  },
]

export function DevelopersClient({
  initialKeys,
  initialWebhooks,
}: {
  initialKeys: Key[]
  initialWebhooks: Webhook[]
}) {
  const [keys, setKeys] = useState<Key[]>(initialKeys)
  const [hooks, setHooks] = useState<Webhook[]>(initialWebhooks)
  const [tab, setTab] = useState<'reference' | 'keys' | 'webhooks' | 'examples'>('reference')

  return (
    <div className="space-y-6 px-8 py-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {(
          [
            ['reference', 'API reference'],
            ['keys', `API keys (${keys.length})`],
            ['webhooks', `Webhooks (${hooks.length})`],
            ['examples', 'Code examples'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-sm border px-3 py-1.5 text-[12.5px] transition ${
              tab === id
                ? 'border-[#D2D4D6] bg-[#F5F5F7] text-fg'
                : 'border-line bg-bg-subtle text-fg-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'reference' && <Reference />}
      {tab === 'keys' && <KeysTab keys={keys} setKeys={setKeys} />}
      {tab === 'webhooks' && <WebhooksTab hooks={hooks} setHooks={setHooks} />}
      {tab === 'examples' && <Examples />}
    </div>
  )
}

function Reference() {
  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <h2 className="font-display text-[18px] font-medium tracking-tight text-fg">
            Authentication
          </h2>
          <p className="text-[13.5px] text-fg-muted">
            Send your API key as a Bearer token. Mint a new key in the &ldquo;API keys&rdquo; tab.
          </p>
          <pre className="overflow-x-auto rounded border border-line bg-bg-subtle p-3 font-mono text-[12px]">
{`Authorization: Bearer lvo_<your-plaintext-key>`}
          </pre>
          <Link href="/developers/docs" className="inline-flex text-[12.5px] font-medium text-fg underline">
            Open full API documentation page
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="font-display text-[18px] font-medium tracking-tight text-fg">
            Endpoints
          </h2>
          <p className="text-[13px] text-fg-muted">
            Base URL: <code className="font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}</code>. All requests
            return JSON. Errors share a stable shape:{' '}
            <code className="font-mono">{`{ "error": { "code": "...", "message": "..." } }`}</code>.
          </p>
          <div className="grid gap-2.5">
            {ENDPOINTS.map((e) => (
              <details key={e.method + e.path} className="rounded border border-line bg-bg p-3">
                <summary className="cursor-pointer">
                  <span className="font-mono text-[12px] font-medium">
                    <Badge variant={e.method === 'GET' ? 'default' : e.method === 'DELETE' ? 'fail' : 'live'}>
                      {e.method}
                    </Badge>{' '}
                    {e.path}
                  </span>
                  <span className="ml-2 text-[12px] text-fg-muted">— {e.desc}</span>
                  <span className="ml-2 font-mono text-[10.5px] uppercase tracking-wider text-fg-faint">
                    scope: {e.scope}
                  </span>
                </summary>
                {(e.body || e.reply) && (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {e.body && (
                      <div>
                        <p className="font-mono text-[10.5px] uppercase tracking-wider text-fg-faint">
                          Request
                        </p>
                        <pre className="mt-1 overflow-x-auto rounded border border-line bg-bg-subtle p-2 font-mono text-[11.5px]">
{e.body}
                        </pre>
                      </div>
                    )}
                    {e.reply && (
                      <div>
                        <p className="font-mono text-[10.5px] uppercase tracking-wider text-fg-faint">
                          Response (200)
                        </p>
                        <pre className="mt-1 overflow-x-auto rounded border border-line bg-bg-subtle p-2 font-mono text-[11.5px]">
{e.reply}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </details>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-2">
          <h2 className="font-display text-[18px] font-medium tracking-tight text-fg">
            Rate limits
          </h2>
          <p className="text-[13.5px] text-fg-muted">
            Per-key token bucket: <strong>60 burst / 5 per second</strong>. Exceed the bucket and you
            get <code className="font-mono">429 rate_limited</code>.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

function KeysTab({
  keys,
  setKeys,
}: {
  keys: Key[]
  setKeys: (k: Key[]) => void
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['calls:read', 'calls:write'])
  const [created, setCreated] = useState<KeyCreated | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const j = await api.get<{ apiKeys: Key[] }>('/api/settings/api-keys')
    setKeys(j.apiKeys)
  }

  async function create() {
    setError(null)
    setLoading(true)
    try {
      const j = await api.post<KeyCreated>('/api/settings/api-keys', { name, scopes })
      setCreated(j)
      setName('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function revoke(id: string) {
    setLoading(true)
    try {
      await api.del(`/api/settings/api-keys/${id}`)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <h3 className="font-medium text-fg">Mint a new key</h3>
          <Input placeholder="Name (e.g. WordPress prod)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={(e) =>
                    setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))
                  }
                />
                <span className="font-mono">{s}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-[13px] text-status-fail">{error}</p>}
          <div className="flex justify-end">
            <Button size="sm" disabled={!name || scopes.length === 0 || loading} onClick={create}>
              Create key
            </Button>
          </div>
        </CardBody>
      </Card>

      {created && (
        <Card className="border-status-live/40 bg-status-live/5">
          <CardBody className="space-y-2">
            <p className="font-medium text-fg">Copy this key now. LivoCall will not show it again.</p>
            <pre className="overflow-x-auto rounded border border-line bg-bg-subtle p-3 font-mono text-[12px]">
{created.plaintext}
            </pre>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              Done
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line bg-bg-subtle/40 text-fg-faint">
              <tr>
                <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Prefix
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Scopes
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Last used
                </th>
                <th className="w-20 px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-fg-muted">
                    No API keys yet.
                  </td>
                </tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-line">
                  <td className="px-4 py-2.5">{k.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px]">{k.prefix}…</td>
                  <td className="px-4 py-2.5">
                    {k.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="mr-1">
                        {s}
                      </Badge>
                    ))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11.5px] text-fg-faint">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading}
                      onClick={() => revoke(k.id)}
                    >
                      Revoke
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

function WebhooksTab({
  hooks,
  setHooks,
}: {
  hooks: Webhook[]
  setHooks: (h: Webhook[]) => void
}) {
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['call.completed', 'call.failed'])
  const [created, setCreated] = useState<HookCreated | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const j = await api.get<{ webhooks: Webhook[] }>('/api/settings/webhooks')
    setHooks(j.webhooks)
  }

  async function create() {
    setError(null)
    setLoading(true)
    try {
      const j = await api.post<HookCreated>('/api/settings/webhooks', { url, events })
      setCreated(j)
      setUrl('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string) {
    setLoading(true)
    try {
      await api.del(`/api/settings/webhooks/${id}`)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <h3 className="font-medium text-fg">New webhook</h3>
          <Input
            placeholder="https://your-server.com/livocall/webhooks"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {EVENTS.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={events.includes(s)}
                  onChange={(e) =>
                    setEvents(e.target.checked ? [...events, s] : events.filter((x) => x !== s))
                  }
                />
                <span className="font-mono">{s}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-[13px] text-status-fail">{error}</p>}
          <div className="flex justify-end">
            <Button size="sm" disabled={!url || events.length === 0 || loading} onClick={create}>
              Create webhook
            </Button>
          </div>
        </CardBody>
      </Card>

      {created && (
        <Card className="border-status-live/40 bg-status-live/5">
          <CardBody className="space-y-2">
            <p className="font-medium text-fg">
              Webhook signing secret — copy now, it won&apos;t be shown again.
            </p>
            <pre className="overflow-x-auto rounded border border-line bg-bg-subtle p-3 font-mono text-[12px]">
{created.secret}
            </pre>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              Done
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line bg-bg-subtle/40 text-fg-faint">
              <tr>
                <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  URL
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  Events
                </th>
                <th className="w-20 px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {hooks.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-fg-muted">
                    No webhooks configured.
                  </td>
                </tr>
              )}
              {hooks.map((h) => (
                <tr key={h.id} className="border-t border-line">
                  <td className="px-4 py-2.5 font-mono text-[12px]">{h.url}</td>
                  <td className="px-4 py-2.5">
                    {h.events.map((e) => (
                      <Badge key={e} variant="outline" className="mr-1">
                        {e}
                      </Badge>
                    ))}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading}
                      onClick={() => remove(h.id)}
                    >
                      Delete
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

function Examples() {
  const base = useMemo(
    () => (typeof window !== 'undefined' ? window.location.origin : 'https://your-livocall-host'),
    [],
  )
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CodeCard
        title="cURL — originate a call"
        code={`curl -X POST ${base}/api/v1/calls \\
  -H "Authorization: Bearer lvo_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "65a1...",
    "to_e164": "+8801711000000"
  }'`}
      />
      <CodeCard
        title="Node.js — originate + listen for completion"
        code={`import crypto from 'node:crypto'

// 1. Originate
const r = await fetch('${base}/api/v1/calls', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${process.env.LIVOCALL_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    agent_id: '65a1...',
    to_e164: '+8801711000000',
  }),
})
const { callId } = await r.json()

// 2. In your webhook handler:
function verify(secret, raw, header) {
  const [t, v1] = header.split(',').map((p) => p.split('=')[1])
  if (Math.abs(Date.now() / 1000 - +t) > 300) return false
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${raw}\`).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))
}`}
      />
      <CodeCard
        title="Python — opt a number out of all future calls"
        code={`import os, requests

requests.post(
    "${base}/api/v1/dnc",
    headers={"Authorization": f"Bearer {os.environ['LIVOCALL_KEY']}"},
    json={"e164": "+8801711000000", "reason": "user_request"},
).raise_for_status()`}
      />
      <CodeCard
        title="PHP — log a call from your CRM"
        code={`<?php
$ch = curl_init('${base}/api/v1/calls');
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: Bearer ' . getenv('LIVOCALL_KEY'),
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => json_encode([
    'agent_id' => '65a1...',
    'to_e164'  => '+8801711000000',
  ]),
]);
echo curl_exec($ch);`}
      />
    </div>
  )
}

function CodeCard({ title, code }: { title: string; code: string }) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <p className="font-medium text-fg">{title}</p>
        <pre className="overflow-x-auto rounded border border-line bg-bg-subtle p-3 font-mono text-[11.5px] leading-relaxed">
{code}
        </pre>
      </CardBody>
    </Card>
  )
}
