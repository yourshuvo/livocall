'use client'
import { useState, useTransition } from 'react'
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'

interface Org {
  id: string
  name: string
  slug: string
  plan: string
  btrcDisclosure: string
  recordingConsent: 'required' | 'optional' | 'disabled'
  btrcDisclosureAudioUrl: string
  dailySpendCapPaisa?: number
  monthlySpendCapPaisa?: number
  compliance?: {
    piiRedaction?: boolean
    detectOptOutSpeech?: boolean
    retentionDays?: number
    auditLogRetentionDays?: number
    agentRoleCanExport?: boolean
  }
}

interface Profile {
  name: string
  email: string
}

interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string | null
  plaintext?: string | null
}

interface Webhook {
  id: string
  url: string
  events: string[]
  description: string
  active: boolean
  secret?: string | null
  lastDeliveryAt: string | null
  lastDeliveryStatus: number | null
  failureCount: number
  createdAt: string | null
}

interface Secret {
  id: string
  name: string
  kind: string
  provider: string
  fingerprint: string
  version: number
  rotatedAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

const WEBHOOK_EVENTS = [
  'call.started',
  'call.completed',
  'call.failed',
  'call.transferred',
  'agent.updated',
  'topup.confirmed',
  'campaign.completed',
]

const SCOPES = [
  'calls:read',
  'calls:write',
  'agents:read',
  'agents:write',
  'campaigns:read',
  'campaigns:write',
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
]

export function SettingsClient({
  initialOrg,
  profile,
  initialKeys,
  initialHooks,
  initialSecrets,
  canAdmin,
}: {
  initialOrg: Org
  profile: Profile
  initialKeys: ApiKey[]
  initialHooks: Webhook[]
  initialSecrets: Secret[]
  canAdmin: boolean
}) {
  return (
    <div className="space-y-8">
      <ProfilePanel initial={profile} />
      <OrgForm initial={initialOrg} canAdmin={canAdmin} />
      <ApiKeysPanel initial={initialKeys} canAdmin={canAdmin} />
      <SecretsPanel initial={initialSecrets} canAdmin={canAdmin} />
      <WebhooksPanel initial={initialHooks} canAdmin={canAdmin} />
    </div>
  )
}

function ProfilePanel({ initial }: { initial: Profile }) {
  const [name, setName] = useState(initial.name)
  const [pending, start] = useTransition()
  const { toast } = useToast()

  function save() {
    start(async () => {
      try {
        await api.patch('/api/settings/profile', {
          name,
        })
        toast('Profile saved', 'success')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <Card id="profile">
      <div className="border-b border-line p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
            <Icon name="settings" size="sm" />
          </span>
          <CardTitle>Profile</CardTitle>
        </div>
        <CardDescription>Update your dashboard name. Sign-in security is managed by Clerk.</CardDescription>
      </div>
      <CardBody className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Email</Label>
          <Input className="mt-2" value={initial.email} disabled />
        </div>
        <div>
          <Label>Name</Label>
          <Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button size="sm" onClick={save} disabled={pending}>
            Save profile
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

function OrgForm({ initial, canAdmin }: { initial: Org; canAdmin: boolean }) {
  const [name, setName] = useState(initial.name)
  const [disclosure, setDisclosure] = useState(initial.btrcDisclosure)
  const [disclosureAudioUrl, setDisclosureAudioUrl] = useState(
    initial.btrcDisclosureAudioUrl ?? '',
  )
  const [recordingConsent, setRecordingConsent] = useState<
    'required' | 'optional' | 'disabled'
  >(initial.recordingConsent ?? 'optional')
  const [dailyCap, setDailyCap] = useState(
    String(Math.round((initial.dailySpendCapPaisa ?? 0) / 100)),
  )
  const [monthlyCap, setMonthlyCap] = useState(
    String(Math.round((initial.monthlySpendCapPaisa ?? 0) / 100)),
  )
  const [piiRedaction, setPiiRedaction] = useState(initial.compliance?.piiRedaction ?? true)
  const [detectOptOutSpeech, setDetectOptOutSpeech] = useState(
    initial.compliance?.detectOptOutSpeech ?? true,
  )
  const [retentionDays, setRetentionDays] = useState(String(initial.compliance?.retentionDays ?? 365))
  const [auditRetentionDays, setAuditRetentionDays] = useState(
    String(initial.compliance?.auditLogRetentionDays ?? 730),
  )
  const [agentRoleCanExport, setAgentRoleCanExport] = useState(
    initial.compliance?.agentRoleCanExport ?? false,
  )
  const [pending, start] = useTransition()
  const { toast } = useToast()

  function save() {
    start(async () => {
      try {
        await api.patch('/api/settings/org', {
          name,
          btrcDisclosure: disclosure,
          btrcDisclosureAudioUrl: disclosureAudioUrl || '',
          recordingConsent,
          dailySpendCapPaisa: Math.max(0, Math.round(Number(dailyCap) || 0) * 100),
          monthlySpendCapPaisa: Math.max(
            0,
            Math.round(Number(monthlyCap) || 0) * 100,
          ),
          compliance: {
            piiRedaction,
            detectOptOutSpeech,
            retentionDays: Math.max(1, Math.round(Number(retentionDays) || 365)),
            auditLogRetentionDays: Math.max(1, Math.round(Number(auditRetentionDays) || 730)),
            agentRoleCanExport,
          },
        })
        toast('Workspace saved', 'success')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <Card id="workspace">
      <div className="border-b border-line p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
            <Icon name="building" size="sm" />
          </span>
          <CardTitle>Workspace</CardTitle>
        </div>
        <CardDescription>
          The business name on invoices and outbound disclosures. BTRC disclosure is played at the
          start of every outbound call.
        </CardDescription>
      </div>
      <CardBody className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Business name</Label>
          <Input
            className="mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canAdmin}
          />
        </div>
        <div>
          <Label>Slug</Label>
          <Input className="mt-2 font-mono text-xs" value={initial.slug} disabled />
        </div>
        <div className="md:col-span-2">
          <Label>BTRC disclosure (script)</Label>
          <Textarea
            rows={3}
            className="mt-2"
            value={disclosure}
            onChange={(e) => setDisclosure(e.target.value)}
            placeholder="This is an automated call from {Business Name}. Press 9 to opt out…"
            disabled={!canAdmin}
          />
          <p className="mt-1 text-[12px] text-fg-muted">
            Synthesized or read aloud at the start of every outbound call.
          </p>
        </div>
        <div className="md:col-span-2">
          <Label>BTRC disclosure audio URL</Label>
          <Input
            className="mt-2"
            type="url"
            value={disclosureAudioUrl}
            onChange={(e) => setDisclosureAudioUrl(e.target.value)}
            placeholder="https://…/disclosure-bn.wav (optional pre-recorded)"
            disabled={!canAdmin}
          />
          <p className="mt-1 text-[12px] text-fg-muted">
            Optional. When set, FreeSWITCH plays this file before audio-forks to the tier.
          </p>
        </div>
        <div className="md:col-span-2">
          <Label>Recording consent</Label>
          <select
            className="mt-2 h-10 w-full rounded-md border border-line bg-bg px-2 text-[13px]"
            value={recordingConsent}
            onChange={(e) =>
              setRecordingConsent(
                e.target.value as 'required' | 'optional' | 'disabled',
              )
            }
            disabled={!canAdmin}
          >
            <option value="required">Required — play consent prompt, then record</option>
            <option value="optional">Optional — record without prompt (default)</option>
            <option value="disabled">Disabled — never record calls</option>
          </select>
        </div>
        <div>
          <Label>Daily spend cap (BDT)</Label>
          <Input
            className="mt-2"
            type="number"
            min={0}
            value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)}
            placeholder="0 = no cap"
            disabled={!canAdmin}
          />
          <p className="mt-1 text-[12px] text-fg-muted">
            New calls are blocked once usage for the UTC day reaches this amount.
          </p>
        </div>
        <div>
          <Label>Monthly spend cap (BDT)</Label>
          <Input
            className="mt-2"
            type="number"
            min={0}
            value={monthlyCap}
            onChange={(e) => setMonthlyCap(e.target.value)}
            placeholder="0 = no cap"
            disabled={!canAdmin}
          />
          <p className="mt-1 text-[12px] text-fg-muted">
            Resets at the start of every UTC month.
          </p>
        </div>
        <div className="md:col-span-2 grid gap-4 rounded-md border border-line bg-bg-subtle p-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-[13px] text-fg">
            <Switch checked={piiRedaction} onChange={setPiiRedaction} disabled={!canAdmin} />
            Redact PII in transcripts and exports
          </label>
          <label className="flex items-center gap-2 text-[13px] text-fg">
            <Switch
              checked={detectOptOutSpeech}
              onChange={setDetectOptOutSpeech}
              disabled={!canAdmin}
            />
            Detect opt-out speech and add callers to DNC
          </label>
          <div>
            <Label>Call retention days</Label>
            <Input className="mt-2" type="number" min={1} value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} disabled={!canAdmin} />
          </div>
          <div>
            <Label>Audit retention days</Label>
            <Input className="mt-2" type="number" min={1} value={auditRetentionDays} onChange={(e) => setAuditRetentionDays(e.target.value)} disabled={!canAdmin} />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-fg md:col-span-2">
            <Switch
              checked={agentRoleCanExport}
              onChange={setAgentRoleCanExport}
              disabled={!canAdmin}
            />
            Allow agent role to export calls and transcripts
          </label>
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button size="sm" onClick={save} disabled={!canAdmin || pending}>
            Save changes
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

function ApiKeysPanel({ initial, canAdmin }: { initial: ApiKey[]; canAdmin: boolean }) {
  const [keys, setKeys] = useState<ApiKey[]>(initial)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['calls:read', 'calls:write', 'agents:read'])
  const [newlyCreated, setNewlyCreated] = useState<ApiKey | null>(null)
  const [pending, start] = useTransition()
  const { toast } = useToast()

  async function refresh() {
    const j = await api.get<{ apiKeys: ApiKey[] }>('/api/settings/api-keys')
    setKeys(j.apiKeys)
  }

  function toggleScope(s: string) {
    setScopes((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]))
  }

  function create() {
    start(async () => {
      try {
        const k = await api.post<ApiKey>('/api/settings/api-keys', { name, scopes })
        setNewlyCreated(k)
        setName('')
        setCreating(false)
        toast('API key created — copy the secret now', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function revoke(id: string) {
    if (!confirm('Revoke this API key? Any code using it will stop working immediately.')) return
    start(async () => {
      try {
        await api.del(`/api/settings/api-keys/${id}`)
        toast('API key revoked', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <Card id="api">
      <div className="flex items-start justify-between border-b border-line p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
              <Icon name="cpu" size="sm" />
            </span>
            <CardTitle>API keys</CardTitle>
          </div>
          <CardDescription>Programmatic access to the public REST API.</CardDescription>
        </div>
        {canAdmin && (
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'New key'}
          </Button>
        )}
      </div>
      <CardBody className="space-y-4">
        {newlyCreated && newlyCreated.plaintext && (
          <div className="rounded-md border border-status-live/40 bg-status-live/5 p-3">
            <p className="text-[12.5px] font-medium text-fg">
              Copy this secret now — it won’t be shown again.
            </p>
            <p className="mt-1 break-all font-mono text-[12px] text-fg">
              {newlyCreated.plaintext}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setNewlyCreated(null)}
            >
              I’ve saved it
            </Button>
          </div>
        )}

        {creating && (
          <div className="rounded-md border border-line p-3">
            <Label>Key name</Label>
            <Input
              className="mt-2"
              placeholder="CRM integration"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="mt-3">
              <Label>Scopes</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SCOPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleScope(s)}
                    className={
                      'rounded-full border px-2 py-0.5 font-mono text-[11px] ' +
                      (scopes.includes(s)
                        ? 'border-fg/40 bg-fg/5 text-fg'
                        : 'border-line text-fg-muted hover:border-fg/30')
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                onClick={create}
                disabled={!name.trim() || scopes.length === 0 || pending}
              >
                Generate key
              </Button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-[13px] text-fg-muted">
            No API keys yet. Create one to use the REST API.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="font-display text-[13px] font-medium text-fg">{k.name}</span>
                <span className="font-mono text-[11.5px] text-fg-faint">{k.prefix}…</span>
                <div className="flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <Badge key={s} variant="outline" className="font-mono text-[10.5px]">
                      {s}
                    </Badge>
                  ))}
                </div>
                {k.revokedAt ? (
                  <Badge variant="outline">revoked</Badge>
                ) : (
                  <span className="flex-1 text-right text-[11.5px] text-fg-muted">
                    {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleString()}` : 'unused'}
                  </span>
                )}
                {!k.revokedAt && canAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function SecretsPanel({ initial, canAdmin }: { initial: Secret[]; canAdmin: boolean }) {
  const [secrets, setSecrets] = useState<Secret[]>(initial)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('api_key')
  const [provider, setProvider] = useState('')
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const { toast } = useToast()

  async function refresh() {
    const j = await api.get<{ secrets: Secret[] }>('/api/settings/secrets')
    setSecrets(j.secrets)
  }

  function save() {
    start(async () => {
      try {
        await api.post('/api/settings/secrets', { name, kind, provider, value })
        setName('')
        setProvider('')
        setValue('')
        setCreating(false)
        toast('Secret saved to encrypted vault', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function revoke(id: string) {
    if (!confirm('Revoke this secret?')) return
    start(async () => {
      try {
        await api.del(`/api/settings/secrets/${id}`)
        toast('Secret revoked', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <Card id="secrets">
      <div className="flex items-start justify-between border-b border-line p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
              <Icon name="shield" size="sm" />
            </span>
            <CardTitle>Secrets vault</CardTitle>
          </div>
          <CardDescription>
            Encrypted storage for tool/API auth values with rotation, audit, and revocation metadata.
          </CardDescription>
        </div>
        {canAdmin && (
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'New secret'}
          </Button>
        )}
      </div>
      <CardBody className="space-y-4">
        {creating && (
          <div className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input className="mt-2 font-mono text-xs" placeholder="paystation.live" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Kind</Label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="mt-2 h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm"
              >
                <option value="api_key">API key</option>
                <option value="bearer_token">Bearer token</option>
                <option value="basic_auth">Basic auth</option>
                <option value="webhook_secret">Webhook secret</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <Label>Provider</Label>
              <Input className="mt-2" placeholder="PayStation, Shopify, CRM..." value={provider} onChange={(e) => setProvider(e.target.value)} />
            </div>
            <div>
              <Label>Secret value</Label>
              <Input className="mt-2 font-mono text-xs" type="password" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button size="sm" disabled={pending || !name || !value} onClick={save}>
                Save encrypted secret
              </Button>
            </div>
          </div>
        )}
        {secrets.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No secrets stored yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {secrets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="font-display text-[13px] font-medium text-fg">{s.name}</span>
                <Badge variant="outline">{s.kind}</Badge>
                {s.provider && <span className="text-[12px] text-fg-muted">{s.provider}</span>}
                <span className="font-mono text-[11.5px] text-fg-faint">fp:{s.fingerprint}</span>
                <span className="text-[11.5px] text-fg-muted">v{s.version}</span>
                {s.revokedAt ? (
                  <Badge variant="outline">revoked</Badge>
                ) : (
                  <span className="flex-1 text-right text-[11.5px] text-fg-muted">
                    rotated {s.rotatedAt ? new Date(s.rotatedAt).toLocaleString() : '—'}
                  </span>
                )}
                {!s.revokedAt && canAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => revoke(s.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function WebhooksPanel({ initial, canAdmin }: { initial: Webhook[]; canAdmin: boolean }) {
  const [hooks, setHooks] = useState<Webhook[]>(initial)
  const [creating, setCreating] = useState(false)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['call.completed', 'call.failed'])
  const [desc, setDesc] = useState('')
  const [newlyCreated, setNewlyCreated] = useState<Webhook | null>(null)
  const [pending, start] = useTransition()
  const { toast } = useToast()

  async function refresh() {
    const j = await api.get<{ webhooks: Webhook[] }>('/api/settings/webhooks')
    setHooks(j.webhooks)
  }

  function toggleEvent(e: string) {
    setEvents((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e]))
  }

  function create() {
    start(async () => {
      try {
        const h = await api.post<Webhook>('/api/settings/webhooks', {
          url,
          events,
          description: desc,
          active: true,
        })
        setNewlyCreated(h)
        setUrl('')
        setDesc('')
        setCreating(false)
        toast('Webhook created — copy the signing secret now', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function toggleActive(h: Webhook) {
    start(async () => {
      try {
        await api.patch(`/api/settings/webhooks/${h.id}`, { active: !h.active })
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function remove(id: string) {
    if (!confirm('Delete this webhook?')) return
    start(async () => {
      try {
        await api.del(`/api/settings/webhooks/${id}`)
        toast('Webhook deleted', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <Card id="webhooks">
      <div className="flex items-start justify-between border-b border-line p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
              <Icon name="plug" size="sm" />
            </span>
            <CardTitle>Webhooks</CardTitle>
          </div>
          <CardDescription>
            HMAC-signed POSTs to your URL for call + account events. Retried with exponential
            backoff.
          </CardDescription>
        </div>
        {canAdmin && (
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'New webhook'}
          </Button>
        )}
      </div>
      <CardBody className="space-y-4">
        {newlyCreated && newlyCreated.secret && (
          <div className="rounded-md border border-status-live/40 bg-status-live/5 p-3">
            <p className="text-[12.5px] font-medium text-fg">
              Copy this signing secret — it won’t be shown again.
            </p>
            <p className="mt-1 break-all font-mono text-[12px] text-fg">{newlyCreated.secret}</p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setNewlyCreated(null)}
            >
              I’ve saved it
            </Button>
          </div>
        )}

        {creating && (
          <div className="rounded-md border border-line p-3 space-y-3">
            <div>
              <Label>URL</Label>
              <Input
                className="mt-2 font-mono text-xs"
                placeholder="https://your-app.example/livocall/webhook"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                className="mt-2"
                placeholder="Post call summaries into CRM"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
            <div>
              <Label>Events</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WEBHOOK_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvent(ev)}
                    className={
                      'rounded-full border px-2 py-0.5 font-mono text-[11px] ' +
                      (events.includes(ev)
                        ? 'border-fg/40 bg-fg/5 text-fg'
                        : 'border-line text-fg-muted hover:border-fg/30')
                    }
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={create}
                disabled={!url.trim() || events.length === 0 || pending}
              >
                Create webhook
              </Button>
            </div>
          </div>
        )}

        {hooks.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No webhooks yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {hooks.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12px] text-fg">{h.url}</p>
                  <p className="text-[11.5px] text-fg-muted">
                    {h.events.join(', ')}
                    {h.description ? ` · ${h.description}` : ''}
                  </p>
                  {h.lastDeliveryAt && (
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">
                      last {new Date(h.lastDeliveryAt).toLocaleString()} · status{' '}
                      {h.lastDeliveryStatus ?? '—'}
                      {h.failureCount > 0 ? ` · ${h.failureCount} fails` : ''}
                    </p>
                  )}
                </div>
                <Badge variant={h.active ? 'live' : 'outline'}>
                  {h.active ? 'active' : 'paused'}
                </Badge>
                {canAdmin && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(h)}>
                      {h.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(h.id)}>
                      Delete
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
