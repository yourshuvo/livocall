'use client'
import type { ReactNode } from 'react'
import { useState, useTransition } from 'react'
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Icon, type IconName } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

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

const SETTINGS_NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '#profile', label: 'Profile', icon: 'settings' },
  { href: '#workspace', label: 'Workspace', icon: 'building' },
  { href: '#api', label: 'API keys', icon: 'cpu' },
  { href: '#secrets', label: 'Secrets vault', icon: 'shield' },
  { href: '#webhooks', label: 'Webhooks', icon: 'plug' },
]

const SETTINGS_LINKS = [
  { href: '/settings/members', label: 'Workspace invites' },
  { href: '/settings/audit', label: 'Audit log' },
  { href: '/settings/indexes', label: 'Index checks' },
]

const selectClass =
  'mt-2 h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm text-fg focus:border-fg/40 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60'

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
  const activeKeys = initialKeys.filter((key) => !key.revokedAt).length
  const activeHooks = initialHooks.filter((hook) => hook.active).length
  const activeSecrets = initialSecrets.filter((secret) => !secret.revokedAt).length

  return (
    <div className="grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)]">
      <SettingsRail
        canAdmin={canAdmin}
        org={initialOrg}
        stats={[
          { label: 'Keys', value: activeKeys },
          { label: 'Secrets', value: activeSecrets },
          { label: 'Hooks', value: activeHooks },
        ]}
      />

      <div className="min-w-0 space-y-5">
        <ProfilePanel initial={profile} />
        <OrgForm initial={initialOrg} canAdmin={canAdmin} />
        <ApiKeysPanel initial={initialKeys} canAdmin={canAdmin} />
        <SecretsPanel initial={initialSecrets} canAdmin={canAdmin} />
        <WebhooksPanel initial={initialHooks} canAdmin={canAdmin} />
      </div>
    </div>
  )
}

function SettingsRail({
  canAdmin,
  org,
  stats,
}: {
  canAdmin: boolean
  org: Org
  stats: Array<{ label: string; value: number }>
}) {
  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <Card className="overflow-hidden">
        <div className="border-line border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-fg-faint font-mono text-[10px] uppercase tracking-[0.14em]">
                Current workspace
              </p>
              <p className="text-fg mt-1 truncate text-[13.5px] font-semibold">{org.name}</p>
              <p className="text-fg-faint truncate font-mono text-[11px]">/{org.slug}</p>
            </div>
            <Badge variant={canAdmin ? 'live' : 'outline'}>
              {canAdmin ? 'admin' : 'read only'}
            </Badge>
          </div>
        </div>

        <nav className="p-2" aria-label="Settings sections">
          {SETTINGS_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg flex items-center gap-2 rounded-[5px] px-2 py-2 text-[12.5px] font-medium transition"
            >
              <Icon name={item.icon} size="xs" className="text-fg-faint" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="border-line bg-bg-subtle/50 grid grid-cols-3 border-y">
          {stats.map((stat) => (
            <div key={stat.label} className="border-line border-r p-3 last:border-r-0">
              <p className="font-display text-fg text-[18px] font-medium leading-none">
                {stat.value}
              </p>
              <p className="text-fg-faint mt-1 font-mono text-[9.5px] uppercase tracking-[0.12em]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-1 p-2">
          {SETTINGS_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg flex items-center justify-between rounded-[5px] px-2 py-1.5 text-[12.5px] transition"
            >
              {link.label}
              <Icon name="chevron-right" size="xs" className="text-fg-faint" />
            </a>
          ))}
        </div>
      </Card>
    </aside>
  )
}

function ProfilePanel({ initial }: { initial: Profile }) {
  const [name, setName] = useState(initial.name)
  const [pending, start] = useTransition()
  const { toast } = useToast()

  function save() {
    start(async () => {
      try {
        await api.patch('/api/settings/profile', { name })
        toast('Profile saved', 'success')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <Card id="profile" className="scroll-mt-24 overflow-hidden">
      <PanelHeader
        icon="settings"
        title="Profile"
        description="Update the display name shown inside LivoCall. Account security is managed by Clerk."
      />
      <CardBody className="grid gap-4 md:grid-cols-2">
        <Field label="Email" description="Used by Clerk for sign-in and recovery.">
          <Input className="mt-2" value={initial.email} disabled />
        </Field>
        <Field label="Name" description="Visible in audit logs and team member lists.">
          <Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </CardBody>
      <ActionFooter>
        <Button size="sm" onClick={save} disabled={pending}>
          <Icon name="check" size="xs" />
          Save profile
        </Button>
      </ActionFooter>
    </Card>
  )
}

function OrgForm({ initial, canAdmin }: { initial: Org; canAdmin: boolean }) {
  const [name, setName] = useState(initial.name)
  const [disclosure, setDisclosure] = useState(initial.btrcDisclosure)
  const [disclosureAudioUrl, setDisclosureAudioUrl] = useState(initial.btrcDisclosureAudioUrl ?? '')
  const [recordingConsent, setRecordingConsent] = useState<'required' | 'optional' | 'disabled'>(
    initial.recordingConsent ?? 'optional',
  )
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
  const [retentionDays, setRetentionDays] = useState(
    String(initial.compliance?.retentionDays ?? 365),
  )
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
          monthlySpendCapPaisa: Math.max(0, Math.round(Number(monthlyCap) || 0) * 100),
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
    <Card id="workspace" className="scroll-mt-24 overflow-hidden">
      <PanelHeader
        icon="building"
        title="Workspace"
        description="Business identity, consent prompts, spend caps, and retention rules saved per workspace."
      />

      <CardBody className="space-y-6">
        <SettingsGroup
          title="Identity"
          description="Shown on invoices and internal workspace menus."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Business name">
              <Input
                className="mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canAdmin}
              />
            </Field>
            <Field label="Workspace slug">
              <Input className="mt-2 font-mono text-xs" value={initial.slug} disabled />
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="Outbound disclosure"
          description="Played or read before outbound calls connect to the voice tier."
        >
          <div className="grid gap-4">
            <Field label="BTRC disclosure script">
              <Textarea
                rows={4}
                className="mt-2"
                value={disclosure}
                onChange={(e) => setDisclosure(e.target.value)}
                placeholder="This is an automated call from {Business Name}. Press 9 to opt out..."
                disabled={!canAdmin}
              />
            </Field>
            <Field label="Disclosure audio URL" description="Optional pre-recorded WAV/MP3 file.">
              <Input
                className="mt-2"
                type="url"
                value={disclosureAudioUrl}
                onChange={(e) => setDisclosureAudioUrl(e.target.value)}
                placeholder="https://example.com/disclosure-bn.wav"
                disabled={!canAdmin}
              />
            </Field>
            <Field label="Recording consent">
              <select
                className={selectClass}
                value={recordingConsent}
                onChange={(e) =>
                  setRecordingConsent(e.target.value as 'required' | 'optional' | 'disabled')
                }
                disabled={!canAdmin}
              >
                <option value="required">Required - play consent prompt, then record</option>
                <option value="optional">Optional - record without prompt</option>
                <option value="disabled">Disabled - never record calls</option>
              </select>
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Spend guardrails" description="Use 0 when a cap should be disabled.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Daily spend cap (BDT)">
              <Input
                className="mt-2"
                type="number"
                min={0}
                value={dailyCap}
                onChange={(e) => setDailyCap(e.target.value)}
                placeholder="0 = no cap"
                disabled={!canAdmin}
              />
            </Field>
            <Field label="Monthly spend cap (BDT)">
              <Input
                className="mt-2"
                type="number"
                min={0}
                value={monthlyCap}
                onChange={(e) => setMonthlyCap(e.target.value)}
                placeholder="0 = no cap"
                disabled={!canAdmin}
              />
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="Compliance controls"
          description="Transcript handling and export permissions for this workspace."
        >
          <div className="border-line overflow-hidden rounded-md border">
            <ToggleRow
              title="Redact PII"
              description="Hide sensitive details in transcripts and exports."
              checked={piiRedaction}
              onChange={setPiiRedaction}
              disabled={!canAdmin}
            />
            <ToggleRow
              title="Detect opt-out speech"
              description="Add callers to DNC when they verbally opt out."
              checked={detectOptOutSpeech}
              onChange={setDetectOptOutSpeech}
              disabled={!canAdmin}
            />
            <ToggleRow
              title="Agent role exports"
              description="Allow agent users to export calls and transcripts."
              checked={agentRoleCanExport}
              onChange={setAgentRoleCanExport}
              disabled={!canAdmin}
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Call retention days">
              <Input
                className="mt-2"
                type="number"
                min={1}
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                disabled={!canAdmin}
              />
            </Field>
            <Field label="Audit retention days">
              <Input
                className="mt-2"
                type="number"
                min={1}
                value={auditRetentionDays}
                onChange={(e) => setAuditRetentionDays(e.target.value)}
                disabled={!canAdmin}
              />
            </Field>
          </div>
        </SettingsGroup>
      </CardBody>

      <ActionFooter
        note={!canAdmin ? 'Only owners and admins can edit workspace settings.' : undefined}
      >
        <Button size="sm" onClick={save} disabled={!canAdmin || pending}>
          <Icon name="check" size="xs" />
          Save workspace
        </Button>
      </ActionFooter>
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

  function toggleScope(scope: string) {
    setScopes((xs) => (xs.includes(scope) ? xs.filter((x) => x !== scope) : [...xs, scope]))
  }

  function create() {
    start(async () => {
      try {
        const key = await api.post<ApiKey>('/api/settings/api-keys', { name, scopes })
        setNewlyCreated(key)
        setName('')
        setCreating(false)
        toast('API key created - copy the secret now', 'success')
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
    <Card id="api" className="scroll-mt-24 overflow-hidden">
      <PanelHeader
        icon="cpu"
        title="API keys"
        description="Programmatic access for integrations and private automations."
        action={
          canAdmin ? (
            <Button
              size="sm"
              variant={creating ? 'secondary' : 'primary'}
              onClick={() => setCreating((v) => !v)}
            >
              <Icon name={creating ? 'x' : 'plus'} size="xs" />
              {creating ? 'Cancel' : 'New key'}
            </Button>
          ) : null
        }
      />

      <CardBody className="space-y-4">
        {newlyCreated?.plaintext && (
          <SecretNotice
            title="Copy this API secret now. It will not be shown again."
            value={newlyCreated.plaintext}
            onDismiss={() => setNewlyCreated(null)}
          />
        )}

        {creating && (
          <CreationPanel>
            <Field label="Key name">
              <Input
                className="mt-2"
                placeholder="CRM integration"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Scopes" description="Select only the permissions this integration needs.">
              <ChipGrid>
                {SCOPES.map((scope) => (
                  <ChoiceChip
                    key={scope}
                    active={scopes.includes(scope)}
                    onClick={() => toggleScope(scope)}
                  >
                    {scope}
                  </ChoiceChip>
                ))}
              </ChipGrid>
            </Field>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={create}
                disabled={!name.trim() || scopes.length === 0 || pending}
              >
                <Icon name="zap" size="xs" />
                Generate key
              </Button>
            </div>
          </CreationPanel>
        )}

        {keys.length === 0 ? (
          <EmptyState
            icon="cpu"
            title="No API keys"
            body="Create a key when an external service needs REST API access."
          />
        ) : (
          <ul className="border-line overflow-hidden rounded-md border">
            {keys.map((key) => (
              <li
                key={key.id}
                className="border-line grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-fg truncate text-[13px] font-semibold">{key.name}</p>
                    <span className="text-fg-faint font-mono text-[11.5px]">{key.prefix}...</span>
                    {key.revokedAt && <Badge variant="outline">revoked</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {key.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="font-mono text-[10.5px]">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-fg-muted mt-2 text-[11.5px]">
                    {key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : 'Never used'}
                  </p>
                </div>
                {!key.revokedAt && canAdmin && (
                  <div className="flex items-start justify-end">
                    <Button size="sm" variant="ghost" onClick={() => revoke(key.id)}>
                      Revoke
                    </Button>
                  </div>
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
    <Card id="secrets" className="scroll-mt-24 overflow-hidden">
      <PanelHeader
        icon="shield"
        title="Secrets vault"
        description="Encrypted tool/API auth values with rotation, audit, and revocation metadata."
        action={
          canAdmin ? (
            <Button
              size="sm"
              variant={creating ? 'secondary' : 'primary'}
              onClick={() => setCreating((v) => !v)}
            >
              <Icon name={creating ? 'x' : 'plus'} size="xs" />
              {creating ? 'Cancel' : 'New secret'}
            </Button>
          ) : null
        }
      />

      <CardBody className="space-y-4">
        {creating && (
          <CreationPanel className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <Input
                className="mt-2 font-mono text-xs"
                placeholder="paystation.live"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Kind">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className={selectClass}
              >
                <option value="api_key">API key</option>
                <option value="bearer_token">Bearer token</option>
                <option value="basic_auth">Basic auth</option>
                <option value="webhook_secret">Webhook secret</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Provider">
              <Input
                className="mt-2"
                placeholder="PayStation, Shopify, CRM..."
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </Field>
            <Field label="Secret value">
              <Input
                className="mt-2 font-mono text-xs"
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <div className="flex justify-end md:col-span-2">
              <Button size="sm" disabled={pending || !name || !value} onClick={save}>
                <Icon name="shield-check" size="xs" />
                Save encrypted secret
              </Button>
            </div>
          </CreationPanel>
        )}

        {secrets.length === 0 ? (
          <EmptyState
            icon="shield"
            title="No secrets"
            body="Store provider credentials here before attaching them to tools."
          />
        ) : (
          <ul className="border-line overflow-hidden rounded-md border">
            {secrets.map((secret) => (
              <li
                key={secret.id}
                className="border-line grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-fg truncate text-[13px] font-semibold">{secret.name}</p>
                    <Badge variant="outline">{secret.kind}</Badge>
                    {secret.revokedAt && <Badge variant="outline">revoked</Badge>}
                  </div>
                  <p className="text-fg-muted mt-1 text-[12px]">
                    {secret.provider || 'No provider'} - version {secret.version}
                  </p>
                  <p className="text-fg-faint mt-1 truncate font-mono text-[11.5px]">
                    fp:{secret.fingerprint}
                  </p>
                  <p className="text-fg-muted mt-1 text-[11.5px]">
                    Rotated {secret.rotatedAt ? formatDate(secret.rotatedAt) : 'never'}
                  </p>
                </div>
                {!secret.revokedAt && canAdmin && (
                  <div className="flex items-start justify-end">
                    <Button size="sm" variant="ghost" onClick={() => revoke(secret.id)}>
                      Revoke
                    </Button>
                  </div>
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

  function toggleEvent(event: string) {
    setEvents((xs) => (xs.includes(event) ? xs.filter((x) => x !== event) : [...xs, event]))
  }

  function create() {
    start(async () => {
      try {
        const hook = await api.post<Webhook>('/api/settings/webhooks', {
          url,
          events,
          description: desc,
          active: true,
        })
        setNewlyCreated(hook)
        setUrl('')
        setDesc('')
        setCreating(false)
        toast('Webhook created - copy the signing secret now', 'success')
        await refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function toggleActive(hook: Webhook) {
    start(async () => {
      try {
        await api.patch(`/api/settings/webhooks/${hook.id}`, { active: !hook.active })
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
    <Card id="webhooks" className="scroll-mt-24 overflow-hidden">
      <PanelHeader
        icon="plug"
        title="Webhooks"
        description="HMAC-signed POSTs for call, agent, campaign, and billing events."
        action={
          canAdmin ? (
            <Button
              size="sm"
              variant={creating ? 'secondary' : 'primary'}
              onClick={() => setCreating((v) => !v)}
            >
              <Icon name={creating ? 'x' : 'plus'} size="xs" />
              {creating ? 'Cancel' : 'New webhook'}
            </Button>
          ) : null
        }
      />

      <CardBody className="space-y-4">
        {newlyCreated?.secret && (
          <SecretNotice
            title="Copy this signing secret now. It will not be shown again."
            value={newlyCreated.secret}
            onDismiss={() => setNewlyCreated(null)}
          />
        )}

        {creating && (
          <CreationPanel>
            <Field label="URL">
              <Input
                className="mt-2 font-mono text-xs"
                placeholder="https://your-app.example/livocall/webhook"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field label="Description" description="Optional context for teammates.">
              <Input
                className="mt-2"
                placeholder="Post call summaries into CRM"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </Field>
            <Field label="Events">
              <ChipGrid>
                {WEBHOOK_EVENTS.map((event) => (
                  <ChoiceChip
                    key={event}
                    active={events.includes(event)}
                    onClick={() => toggleEvent(event)}
                  >
                    {event}
                  </ChoiceChip>
                ))}
              </ChipGrid>
            </Field>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={create}
                disabled={!url.trim() || events.length === 0 || pending}
              >
                <Icon name="plus" size="xs" />
                Create webhook
              </Button>
            </div>
          </CreationPanel>
        )}

        {hooks.length === 0 ? (
          <EmptyState
            icon="plug"
            title="No webhooks"
            body="Create a webhook to send LivoCall events to your app."
          />
        ) : (
          <ul className="border-line overflow-hidden rounded-md border">
            {hooks.map((hook) => (
              <li
                key={hook.id}
                className="border-line grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-fg truncate font-mono text-[12px] font-semibold">
                      {hook.url}
                    </p>
                    <Badge variant={hook.active ? 'live' : 'outline'}>
                      {hook.active ? 'active' : 'paused'}
                    </Badge>
                  </div>
                  <p className="text-fg-muted mt-1 text-[11.5px]">
                    {hook.events.join(', ')}
                    {hook.description ? ` - ${hook.description}` : ''}
                  </p>
                  {hook.lastDeliveryAt && (
                    <p className="text-fg-faint mt-1 font-mono text-[10.5px] uppercase tracking-[0.12em]">
                      Last {formatDate(hook.lastDeliveryAt)} - status{' '}
                      {hook.lastDeliveryStatus ?? 'unknown'}
                      {hook.failureCount > 0 ? ` - ${hook.failureCount} fails` : ''}
                    </p>
                  )}
                </div>
                {canAdmin && (
                  <div className="flex flex-wrap items-start justify-end gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(hook)}>
                      {hook.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(hook.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function PanelHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="border-line bg-bg-subtle/35 flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="border-line bg-bg text-fg-muted shadow-card grid size-9 shrink-0 place-items-center rounded-md border">
          <Icon name={icon} size="md" />
        </span>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="max-w-2xl">{description}</CardDescription>
        </div>
      </div>
      {action && <div className="flex shrink-0 justify-start sm:justify-end">{action}</div>}
    </div>
  )
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="border-line border-t pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3">
        <p className="text-fg text-[13px] font-semibold">{title}</p>
        {description && <p className="text-fg-muted mt-0.5 text-[12px]">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  description,
  children,
  className,
}: {
  label: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {description && (
        <p className="text-fg-muted mt-1 text-[12px] leading-relaxed">{description}</p>
      )}
    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="border-line bg-bg flex items-center justify-between gap-4 border-b px-3 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="text-fg block text-[12.5px] font-medium">{title}</span>
        <span className="text-fg-muted mt-0.5 block text-[11.5px]">{description}</span>
      </span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  )
}

function ActionFooter({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="border-line bg-bg-subtle/35 flex flex-col gap-3 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-fg-muted text-[12px]">{note}</p>
      <div className="flex justify-end">{children}</div>
    </div>
  )
}

function CreationPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('border-line bg-bg-subtle/45 rounded-md border p-4', className)}>
      {children}
    </div>
  )
}

function ChipGrid({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
}

function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 font-mono text-[11px] transition',
        active
          ? 'border-fg/40 bg-fg/5 text-fg'
          : 'border-line bg-bg text-fg-muted hover:border-fg/30 hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function SecretNotice({
  title,
  value,
  onDismiss,
}: {
  title: string
  value: string
  onDismiss: () => void
}) {
  return (
    <div className="border-status-live/40 bg-status-live/5 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <Icon name="shield-check" size="sm" className="text-status-live mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-fg text-[12.5px] font-medium">{title}</p>
          <p className="border-status-live/20 bg-bg text-fg mt-1 break-all rounded border px-2 py-1.5 font-mono text-[12px]">
            {value}
          </p>
        </div>
      </div>
      <Button size="sm" variant="ghost" className="mt-2" onClick={onDismiss}>
        I saved it
      </Button>
    </div>
  )
}

function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="border-line bg-bg-subtle/40 rounded-md border border-dashed px-4 py-8 text-center">
      <span className="border-line bg-bg text-fg-faint mx-auto grid size-9 place-items-center rounded-md border">
        <Icon name={icon} size="sm" />
      </span>
      <p className="text-fg mt-3 text-[13px] font-medium">{title}</p>
      <p className="text-fg-muted mx-auto mt-1 max-w-md text-[12px]">{body}</p>
    </div>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}
