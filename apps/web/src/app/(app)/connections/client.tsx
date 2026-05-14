'use client'
import { useState } from 'react'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-fetch'
import { fmtPhoneE164 } from '@/lib/format'

const PLATFORMS = [
  { id: 'rest', label: 'Universal API', desc: 'Automate calls, contacts, campaigns, KB, DNC and webhooks from any app.' },
  { id: 'zapier', label: 'Zapier', desc: 'Trigger calls and ingest call.completed events into 6,000+ apps.' },
  { id: 'make', label: 'Make (Integromat)', desc: 'Same as Zapier — webhook + REST.' },
  { id: 'n8n', label: 'n8n', desc: 'Self-hosted automation runtime.' },
  { id: 'wordpress', label: 'WordPress / WooCommerce', desc: 'Confirm WooCommerce orders with AI calls, write order notes, and sync outcomes back.' },
  { id: 'shopify', label: 'Shopify', desc: 'Originate calls on abandoned carts; sync customer phone book.' },
] as const

interface Conn {
  id: string
  platform: string
  name: string
  siteUrl: string
  active: boolean
  createdAt: string
}

interface AgentOption {
  id: string
  name: string
  status: string
}

interface PhoneOption {
  id: string
  e164: string
  label: string
}

interface CreatedResp {
  id: string
  platform: string
  name: string
  apiKey: { id: string; prefix: string; plaintext: string; scopes: string[] }
}

export function ConnectionsClient({
  initial,
  agents,
  phoneNumbers,
}: {
  initial: Conn[]
  agents: AgentOption[]
  phoneNumbers: PhoneOption[]
}) {
  const [items, setItems] = useState<Conn[]>(initial)
  const [open, setOpen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [defaultAgentId, setDefaultAgentId] = useState(agents[0]?.id ?? '')
  const [defaultFromE164, setDefaultFromE164] = useState(phoneNumbers[0]?.e164 ?? '')
  const [shopifySharedSecret, setShopifySharedSecret] = useState('')
  const [ordersCreate, setOrdersCreate] = useState(true)
  const [ordersPaid, setOrdersPaid] = useState(false)
  const [ordersFulfilled, setOrdersFulfilled] = useState(false)
  const [checkoutsCreate, setCheckoutsCreate] = useState(true)
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('08:00')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedResp | null>(null)
  const [loading, setLoading] = useState(false)

  function resetForm() {
    setName('')
    setSiteUrl('')
    setDefaultAgentId(agents[0]?.id ?? '')
    setDefaultFromE164(phoneNumbers[0]?.e164 ?? '')
    setShopifySharedSecret('')
    setOrdersCreate(true)
    setOrdersPaid(false)
    setOrdersFulfilled(false)
    setCheckoutsCreate(true)
    setQuietStart('22:00')
    setQuietEnd('08:00')
  }

  function createConfig(platform: string) {
    if (platform === 'shopify') {
      return {
        shopifySharedSecret: shopifySharedSecret.trim(),
        defaultAgentId,
        defaultFromE164,
        timezone: 'Asia/Dhaka',
        quietHours: {
          startMinutes: timeToMinutes(quietStart),
          endMinutes: timeToMinutes(quietEnd),
        },
        triggers: {
          'orders/create': { enabled: ordersCreate },
          'orders/paid': { enabled: ordersPaid },
          'orders/fulfilled': { enabled: ordersFulfilled },
          'checkouts/create': { enabled: checkoutsCreate },
        },
      }
    }
    if (platform === 'wordpress') {
      return {
        defaultAgentId,
        defaultFromE164,
        timezone: 'Asia/Dhaka',
        triggers: {
          'order.processing': { enabled: true },
        },
      }
    }
    return {}
  }

  function canCreate(platform: string) {
    if (!name || loading) return false
    if (platform === 'shopify') return Boolean(siteUrl && defaultAgentId)
    if (platform === 'wordpress') return Boolean(siteUrl && defaultAgentId)
    return true
  }

  async function refresh() {
    const j = await api.get<{ connections: Conn[] }>('/api/connections')
    setItems(j.connections)
  }

  async function create(platform: string) {
    setError(null)
    setLoading(true)
    try {
      const j = await api.post<CreatedResp>('/api/connections', {
        platform,
        name,
        siteUrl,
        config: createConfig(platform),
      })
      setCreated(j)
      resetForm()
      setOpen(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Disconnect this integration and revoke its API key?')) return
    setLoading(true)
    try {
      await api.del(`/api/connections/${id}`)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 px-8 py-8">
      {created && (
        <Card className="border-status-live/40 bg-status-live/5">
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-fg">
                {created.name} — connected
              </p>
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                Close
              </Button>
            </div>
            <p className="text-[13px] text-fg-muted">
              Copy this API key now — LivoCall will <strong>not</strong> show it again.
            </p>
            <pre className="overflow-x-auto rounded border border-line bg-bg-subtle p-3 font-mono text-[12px]">
{created.apiKey.plaintext}
            </pre>
            <p className="text-[12px] text-fg-faint">
              Scopes: {created.apiKey.scopes.join(', ')}
            </p>
            <PluginInstructions
              platform={created.platform}
              apiKey={created.apiKey.plaintext}
            />
          </CardBody>
        </Card>
      )}

      {error && <p className="text-[13px] text-status-fail">{error}</p>}

      <WooCommerceOrderFlow />

      <section>
        <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
          Available integrations
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {PLATFORMS.map((p) => (
            <Card key={p.id}>
              <CardBody className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-fg">{p.label}</p>
                  <Badge variant="outline">{p.id}</Badge>
                </div>
                <p className="text-[12.5px] text-fg-muted">{p.desc}</p>
                {open === p.id ? (
                  <div className="space-y-2 pt-2">
                    <Input
                      placeholder="Connection name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    {(p.id === 'wordpress' || p.id === 'shopify') && (
                      <>
                        <Input
                          placeholder={p.id === 'wordpress' ? 'https://yoursite.com' : 'mystore.myshopify.com'}
                          value={siteUrl}
                          onChange={(e) => setSiteUrl(e.target.value)}
                        />
                        <select
                          value={defaultAgentId}
                          onChange={(e) => setDefaultAgentId(e.target.value)}
                          className="h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm text-fg focus:border-fg/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        >
                          <option value="">Select default agent</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name} ({agent.status})
                            </option>
                          ))}
                        </select>
                        <select
                          value={defaultFromE164}
                          onChange={(e) => setDefaultFromE164(e.target.value)}
                          className="h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm text-fg focus:border-fg/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        >
                          <option value="">Auto-select outbound number</option>
                          {phoneNumbers.map((phone) => (
                            <option key={phone.id} value={phone.e164}>
                              {phone.label ? `${phone.label} · ` : ''}{fmtPhoneE164(phone.e164)}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    {p.id === 'shopify' && (
                      <div className="space-y-2 rounded border border-line bg-bg-subtle p-3">
                        <Input
                          placeholder="Shopify shared secret"
                          value={shopifySharedSecret}
                          onChange={(e) => setShopifySharedSecret(e.target.value)}
                        />
                        <div className="grid gap-1.5 text-[12px] text-fg-muted">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={ordersCreate} onChange={(e) => setOrdersCreate(e.target.checked)} />
                            orders/create
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={ordersPaid} onChange={(e) => setOrdersPaid(e.target.checked)} />
                            orders/paid
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={ordersFulfilled} onChange={(e) => setOrdersFulfilled(e.target.checked)} />
                            orders/fulfilled
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={checkoutsCreate} onChange={(e) => setCheckoutsCreate(e.target.checked)} />
                            checkouts/create
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="time"
                            value={quietStart}
                            onChange={(e) => setQuietStart(e.target.value)}
                            aria-label="Quiet hours start"
                          />
                          <Input
                            type="time"
                            value={quietEnd}
                            onChange={(e) => setQuietEnd(e.target.value)}
                            aria-label="Quiet hours end"
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!canCreate(p.id)}
                        onClick={() => create(p.id)}
                      >
                        Connect
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setOpen(null)
                          resetForm()
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      resetForm()
                      setOpen(p.id)
                    }}
                  >
                    Connect
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
          Active connections
        </h2>
        <div className="grid gap-3">
          {items.length === 0 && (
            <Card>
              <CardBody className="text-[13px] text-fg-muted">
                No connections yet. Connect Universal API to mint an automation key, then copy examples
                from Developers → API reference.
              </CardBody>
            </Card>
          )}
          {items.map((c) => (
            <Card key={c.id}>
              <CardBody className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-fg">{c.name}</p>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">
                    {c.platform} · {c.siteUrl || 'no site URL'} ·{' '}
                    {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.active ? 'live' : 'default'}>
                    {c.active ? 'active' : 'paused'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => remove(c.id)}
                  >
                    Disconnect
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

function WooCommerceOrderFlow() {
  return (
    <section className="rounded-lg border border-line bg-bg-subtle/40 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
            Order confirmation agent
          </p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-fg">
            WooCommerce order → LivoCall dashboard → AI confirmation call
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
            The WordPress plugin listens to WooCommerce order status changes, sends the customer
            phone number and order metadata to LivoCall, and the selected agent calls the buyer to
            confirm delivery details before dispatch.
          </p>
        </div>
        <Badge variant="accent">COD ready</Badge>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {[
          {
            title: '1. Connect plugin',
            body: 'Create a WordPress connection, copy the API key, then paste it in WP-Admin → Settings → LivoCall.',
          },
          {
            title: '2. Pick trigger',
            body: 'Enable order.processing, on-hold, failed, completed, or manual “Call customer” triggers.',
          },
          {
            title: '3. Select agent',
            body: 'Use an order-confirmation agent that receives customer name, order number, items, total, and currency.',
          },
          {
            title: '4. Track result',
            body: 'The call appears in LivoCall calls/analytics, and WordPress writes a WooCommerce order note with the call id.',
          },
        ].map((step) => (
          <Card key={step.title}>
            <CardBody>
              <p className="text-[13px] font-medium text-fg">{step.title}</p>
              <p className="mt-1 text-[12.5px] text-fg-muted">{step.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-[13px] font-medium text-fg">Metadata sent to the agent</p>
            <pre className="mt-2 overflow-x-auto rounded border border-line bg-bg p-3 font-mono text-[11.5px] text-fg-muted">
{`{
  "source": "wordpress",
  "trigger": "order.processing",
  "order_id": "1234",
  "order_number": "LC-1234",
  "customer": "Rahim Uddin",
  "items": "Black Panjabi × 1, Shoes × 1",
  "total": "2450",
  "currency": "BDT"
}`}
            </pre>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[13px] font-medium text-fg">Recommended agent behavior</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] text-fg-muted">
              <li>Greet the buyer and mention the store/order number.</li>
              <li>Confirm products, total amount, phone number, and delivery address.</li>
              <li>Ask if they want to confirm, reschedule, cancel, or talk to a human.</li>
              <li>Send outcome labels back as call metadata for dashboard reporting.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </section>
  )
}

function PluginInstructions({ platform, apiKey }: { platform: string; apiKey: string }) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-livocall-host'
  switch (platform) {
    case 'wordpress':
      return (
        <details className="rounded border border-line bg-bg p-3 text-[12.5px]">
          <summary className="cursor-pointer font-medium text-fg">
            WordPress / WooCommerce install instructions
          </summary>
          <ol className="ml-4 mt-2 list-decimal space-y-1.5 text-fg-muted">
            <li>
              Download <code>plugins/livocall-wp.zip</code> from your LivoCall deliverable bundle (or
              copy <code>plugins/livocall-wp/livocall.php</code> straight into your{' '}
              <code>wp-content/plugins/</code>).
            </li>
            <li>
              In WP-Admin → Plugins, activate &ldquo;LivoCall — Order confirmation calls&rdquo;.
            </li>
            <li>
              Go to <strong>Settings → LivoCall</strong> and paste:
              <pre className="mt-1 overflow-x-auto rounded border border-line bg-bg-subtle p-2 font-mono">
{`API base : ${baseUrl}
API key  : ${apiKey}`}
              </pre>
            </li>
            <li>
              Add the order-confirmation agent id, default outbound number, quiet hours, and retry
              policy.
            </li>
            <li>
              Enable <strong>order.processing</strong> for COD confirmation, or enable manual calls
              from the WooCommerce order screen.
            </li>
          </ol>
        </details>
      )
    case 'shopify':
      return (
        <details className="rounded border border-line bg-bg p-3 text-[12.5px]">
          <summary className="cursor-pointer font-medium text-fg">
            Shopify install instructions
          </summary>
          <ol className="ml-4 mt-2 list-decimal space-y-1.5 text-fg-muted">
            <li>
              In Shopify admin → <strong>Settings → Notifications → Webhooks</strong>, create:
              <pre className="mt-1 overflow-x-auto rounded border border-line bg-bg-subtle p-2 font-mono">
{`Event : checkouts/create
URL   : ${baseUrl}/api/connections/shopify/webhook
Format: JSON`}
              </pre>
            </li>
            <li>
              Open Shopify <strong>Apps → Develop apps → Configure Admin API scopes</strong> and add
              the LivoCall script with this token:
              <pre className="mt-1 overflow-x-auto rounded border border-line bg-bg-subtle p-2 font-mono">
{apiKey}
              </pre>
            </li>
            <li>
              Or run the standalone Node sidecar in{' '}
              <code>plugins/livocall-shopify/</code> from your deliverable.
            </li>
          </ol>
        </details>
      )
    default:
      return (
        <details className="rounded border border-line bg-bg p-3 text-[12.5px]">
          <summary className="cursor-pointer font-medium text-fg">
            How to use this key
          </summary>
          <p className="mt-2 text-fg-muted">
            Send <code>Authorization: Bearer {apiKey}</code> to{' '}
            <code>{baseUrl}/api/v1/...</code>. See the <strong>Developers</strong> page for the full
            REST reference and copy-paste examples.
          </p>
        </details>
      )
  }
}
