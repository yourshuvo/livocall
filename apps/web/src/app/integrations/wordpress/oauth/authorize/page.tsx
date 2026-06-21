import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { connectMongo } from '@/lib/db'
import { getSession } from '@/lib/session'
import { validateWordPressOAuthRedirect } from '@/lib/wordpress-integration'
import { Agent, type AgentLean } from '@/models/Agent'
import { PhoneNumber, type PhoneNumberLean } from '@/models/PhoneNumber'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Connect WordPress - LivoCall' }

type Search = Record<string, string | string[] | undefined>

function one(search: Search | undefined, key: string) {
  const value = search?.[key]
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function loginRedirect(search: Search | undefined) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search || {})) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
    else if (value) params.set(key, value)
  }
  const path = `/integrations/wordpress/oauth/authorize${params.size ? `?${params}` : ''}`
  return `/login?redirect_url=${encodeURIComponent(path)}`
}

export default async function WordPressOAuthAuthorizePage({
  searchParams,
}: {
  searchParams?: Promise<Search>
}) {
  const search = await searchParams
  const session = await getSession()
  if (!session.userId || !session.orgId) redirect(loginRedirect(search))

  const state = one(search, 'state')
  const callbackUrl = one(search, 'callbackUrl')
  const siteUrl = one(search, 'siteUrl')
  const siteName = one(search, 'siteName')
  const pluginVersion = one(search, 'pluginVersion')
  const codeChallenge = one(search, 'codeChallenge')
  const codeChallengeMethod = one(search, 'codeChallengeMethod') || 'S256'
  const redirectCheck =
    state && callbackUrl && siteUrl && codeChallenge
      ? validateWordPressOAuthRedirect({ siteUrl, callbackUrl })
      : { ok: false as const, error: 'Missing OAuth parameters from the WordPress plugin.' }

  let agents: AgentLean[] = []
  let phoneNumbers: PhoneNumberLean[] = []
  if (redirectCheck.ok) {
    await connectMongo()
    ;[agents, phoneNumbers] = await Promise.all([
      Agent.find({ orgId: session.orgId }).sort({ name: 1 }).lean<AgentLean[]>(),
      PhoneNumber.find({ orgId: session.orgId, outboundEnabled: true, status: 'active' })
        .sort({ e164: 1 })
        .lean<PhoneNumberLean[]>(),
    ])
  }

  const canAuthorize = session.role === 'owner' || session.role === 'admin'
  const hostname = redirectCheck.ok ? redirectCheck.site.hostname : ''
  const defaultName = siteName || (hostname ? `WordPress - ${hostname}` : 'WordPress site')

  return (
    <main className="min-h-dvh bg-bg px-4 py-10 text-fg">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
            WordPress integration
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-fg">
            Connect WordPress to LivoCall
          </h1>
          <p className="mt-2 text-[13px] text-fg-muted">
            Authorize this WordPress site, choose the default call agent, and return to WP-Admin
            connected.
          </p>
        </div>

        <Card>
          <CardBody className="space-y-5">
            {!canAuthorize && (
              <p className="rounded border border-status-fail/30 bg-status-fail/5 p-3 text-[13px] text-status-fail">
                You need owner or admin access to authorize a WordPress connection.
              </p>
            )}
            {!redirectCheck.ok && (
              <p className="rounded border border-status-fail/30 bg-status-fail/5 p-3 text-[13px] text-status-fail">
                {redirectCheck.error}
              </p>
            )}
            {redirectCheck.ok && (
              <>
                <div className="rounded border border-line bg-bg-subtle p-3 text-[13px]">
                  <p className="font-medium text-fg">{siteName || hostname}</p>
                  <p className="mt-1 font-mono text-[11px] text-fg-faint">{redirectCheck.site.href}</p>
                  {pluginVersion && (
                    <p className="mt-1 text-[12px] text-fg-muted">Plugin version {pluginVersion}</p>
                  )}
                </div>

                {agents.length === 0 ? (
                  <p className="rounded border border-line bg-bg-subtle p-3 text-[13px] text-fg-muted">
                    Create an agent in LivoCall before authorizing WordPress.
                  </p>
                ) : (
                  <form method="post" action="/api/integrations/wordpress/oauth/authorize" className="space-y-4">
                    <input type="hidden" name="state" value={state} />
                    <input type="hidden" name="callbackUrl" value={redirectCheck.callback.href} />
                    <input type="hidden" name="siteUrl" value={redirectCheck.site.href} />
                    <input type="hidden" name="siteName" value={siteName} />
                    <input type="hidden" name="pluginVersion" value={pluginVersion} />
                    <input type="hidden" name="codeChallenge" value={codeChallenge} />
                    <input type="hidden" name="codeChallengeMethod" value={codeChallengeMethod} />

                    <label className="block text-[13px] font-medium text-fg">
                      Connection name
                      <Input name="connectionName" defaultValue={defaultName} className="mt-1" required />
                    </label>

                    <label className="block text-[13px] font-medium text-fg">
                      Default agent
                      <select
                        name="defaultAgentId"
                        defaultValue={String(agents[0]._id)}
                        required
                        className="mt-1 h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm text-fg focus:border-fg/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
                      >
                        {agents.map((agent) => (
                          <option key={String(agent._id)} value={String(agent._id)}>
                            {agent.name} ({agent.status})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[13px] font-medium text-fg">
                      Outbound number
                      <select
                        name="defaultFromE164"
                        defaultValue={phoneNumbers[0]?.e164 || ''}
                        className="mt-1 h-10 w-full rounded border border-line bg-bg-subtle px-3 text-sm text-fg focus:border-fg/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
                      >
                        <option value="">Auto-select outbound number</option>
                        {phoneNumbers.map((phone) => (
                          <option key={String(phone._id)} value={phone.e164}>
                            {phone.label ? `${phone.label} - ` : ''}{phone.e164}
                          </option>
                        ))}
                      </select>
                    </label>

                    <fieldset className="space-y-2 rounded border border-line bg-bg-subtle p-3">
                      <legend className="px-1 text-[13px] font-medium text-fg">Initial triggers</legend>
                      {[
                        ['order.processing', 'WooCommerce processing orders'],
                        ['order.failed', 'WooCommerce failed payments'],
                        ['cf7.submission', 'Contact Form 7 submissions'],
                        ['wpforms.submission', 'WPForms submissions'],
                        ['gravity_forms.submission', 'Gravity Forms submissions'],
                      ].map(([value, label], index) => (
                        <label key={value} className="flex items-center gap-2 text-[13px] text-fg-muted">
                          <input type="checkbox" name="triggers" value={value} defaultChecked={index === 0} />
                          {label}
                        </label>
                      ))}
                    </fieldset>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={!canAuthorize}>
                        Authorize WordPress
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </main>
  )
}
