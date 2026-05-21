import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Org, type OrgLean } from '@/models/Org'
import { ApiKey, type ApiKeyLean } from '@/models/ApiKey'
import { Webhook, type WebhookLean } from '@/models/Webhook'
import { User, type UserDoc } from '@/models/User'
import { Secret, type SecretLean } from '@/models/Secret'
import { apiKeyToJson, orgToJson, secretToJson, webhookToJson } from '@/lib/serialize'
import { SettingsClient } from './client'

export const dynamic = 'force-dynamic'

function SettingsHeader({ description }: { description: string }) {
  return (
    <div className="border-line/70 border-b px-6 py-5">
      <p className="text-fg-faint font-mono text-[10.5px] uppercase tracking-[0.14em]">Account</p>
      <h1 className="text-fg mt-1 text-[20px] font-semibold tracking-tight">Settings</h1>
      <p className="text-fg-muted mt-1 text-[13px]">{description}</p>
    </div>
  )
}

export default async function SettingsPage() {
  const session = await getSession()
  let org: OrgLean | null = null
  let user: UserDoc | null = null
  let keys: ApiKeyLean[] = []
  let hooks: WebhookLean[] = []
  let secrets: SecretLean[] = []
  if (isMongoConfigured()) {
    try {
      await connectMongo()
      ;[org, user, keys, hooks, secrets] = await Promise.all([
        Org.findById(session.orgId).lean<OrgLean>(),
        User.findById(session.userId).lean<UserDoc>(),
        ApiKey.find({ orgId: session.orgId }).sort({ createdAt: -1 }).lean<ApiKeyLean[]>(),
        Webhook.find({ orgId: session.orgId }).sort({ createdAt: -1 }).lean<WebhookLean[]>(),
        Secret.find({ orgId: session.orgId }).sort({ updatedAt: -1 }).lean<SecretLean[]>(),
      ])
    } catch {
      // empty
    }
  }

  const canAdmin = session.role === 'owner' || session.role === 'admin'

  if (!org) {
    return (
      <>
        <TopBar title="Settings" searchPlaceholder="Search settings..." />
        <div className="bg-bg flex-1 overflow-y-auto">
          <SettingsHeader description="Workspace, compliance, API keys, webhooks." />
          <div className="text-fg-muted px-6 py-6 text-[13px]">
            Could not load workspace. Check your MongoDB connection.
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title="Settings" searchPlaceholder="Search settings..." />
      <div className="bg-bg flex-1 overflow-y-auto">
        <SettingsHeader description="Workspace, compliance, API keys, webhooks. Saved per workspace." />
        <div className="px-6 py-6">
          <SettingsClient
            initialOrg={orgToJson(org) as never}
            profile={{ name: user?.name ?? '', email: session.email ?? '' }}
            initialKeys={keys.map((k) => apiKeyToJson(k)) as never}
            initialHooks={hooks.map((h) => webhookToJson(h)) as never}
            initialSecrets={secrets.map((s) => secretToJson(s)) as never}
            canAdmin={canAdmin}
          />
        </div>
      </div>
    </>
  )
}
