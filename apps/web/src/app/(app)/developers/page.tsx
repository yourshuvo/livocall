import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { ApiKey, type ApiKeyLean } from '@/models/ApiKey'
import { Webhook, type WebhookLean } from '@/models/Webhook'
import { DevelopersClient } from './client'

export const dynamic = 'force-dynamic'

export default async function DevelopersPage() {
  const s = await getSession()
  let keys: ApiKeyLean[] = []
  let hooks: WebhookLean[] = []
  if (isMongoConfigured() && s.orgId) {
    try {
      await connectMongo()
      keys = await ApiKey.find({ orgId: s.orgId, revokedAt: null })
        .sort({ createdAt: -1 })
        .lean<ApiKeyLean[]>()
      hooks = await Webhook.find({ orgId: s.orgId })
        .sort({ createdAt: -1 })
        .lean<WebhookLean[]>()
    } catch {
      /* empty */
    }
  }
  return (
    <>
      <TopBar title="Developers" searchPlaceholder="Search keys, webhooks..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">API</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Developers</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Build automations on top of LivoCall. Mint API keys, register webhooks, and copy reference code straight into your project.
          </p>
        </div>
        <DevelopersClient
          initialKeys={keys.map((k) => ({
            id: String(k._id),
            name: k.name,
            prefix: k.prefix,
            scopes: k.scopes,
            lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
            createdAt: k.createdAt.toISOString(),
          }))}
          initialWebhooks={hooks.map((h) => ({
            id: String(h._id),
            url: h.url,
            events: h.events,
            active: h.active,
            createdAt: h.createdAt.toISOString(),
          }))}
        />
      </div>
    </>
  )
}
