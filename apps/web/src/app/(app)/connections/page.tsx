import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Agent, type AgentLean } from '@/models/Agent'
import { Connection, type ConnectionLean } from '@/models/Connection'
import { PhoneNumber, type PhoneNumberLean } from '@/models/PhoneNumber'
import { ConnectionsClient } from './client'

export const dynamic = 'force-dynamic'

export default async function ConnectionsPage() {
  const s = await getSession()
  let conns: ConnectionLean[] = []
  let agents: AgentLean[] = []
  let phoneNumbers: PhoneNumberLean[] = []
  if (isMongoConfigured() && s.orgId) {
    try {
      await connectMongo()
      ;[conns, agents, phoneNumbers] = await Promise.all([
        Connection.find({ orgId: s.orgId })
          .sort({ updatedAt: -1 })
          .lean<ConnectionLean[]>(),
        Agent.find({ orgId: s.orgId })
          .sort({ name: 1 })
          .lean<AgentLean[]>(),
        PhoneNumber.find({ orgId: s.orgId, outboundEnabled: true, status: 'active' })
          .sort({ e164: 1 })
          .lean<PhoneNumberLean[]>(),
      ])
    } catch {
      /* empty */
    }
  }
  return (
    <>
      <TopBar title="Connections" searchPlaceholder="Search connections..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Integrations</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Connections</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Connect any automation platform with one Universal API key, or use ready flows for
            Zapier, Make, n8n, WordPress and Shopify.
          </p>
        </div>
        <ConnectionsClient
          initial={conns.map((c) => ({
            id: String(c._id),
            platform: c.platform,
            name: c.name,
            siteUrl: c.siteUrl,
            active: c.active,
            createdAt: c.createdAt.toISOString(),
          }))}
          agents={agents.map((a) => ({
            id: String(a._id),
            name: a.name,
            status: a.status,
          }))}
          phoneNumbers={phoneNumbers.map((n) => ({
            id: String(n._id),
            e164: n.e164,
            label: n.label,
          }))}
        />
      </div>
    </>
  )
}
