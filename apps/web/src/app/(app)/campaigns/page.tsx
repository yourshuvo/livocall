import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Campaign, type CampaignLean } from '@/models/Campaign'
import { Agent, type AgentLean } from '@/models/Agent'
import { PhoneNumber, type PhoneNumberLean } from '@/models/PhoneNumber'
import { CampaignsClient } from './client'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const s = await getSession()
  let campaigns: CampaignLean[] = []
  let agents: AgentLean[] = []
  let numbers: PhoneNumberLean[] = []
  if (isMongoConfigured() && s.orgId) {
    try {
      await connectMongo()
      ;[campaigns, agents, numbers] = await Promise.all([
        Campaign.find({ orgId: s.orgId }).sort({ updatedAt: -1 }).limit(50).lean<CampaignLean[]>(),
        Agent.find({ orgId: s.orgId }).sort({ name: 1 }).lean<AgentLean[]>(),
        PhoneNumber.find({ orgId: s.orgId, outboundEnabled: true }).sort({ e164: 1 }).lean<PhoneNumberLean[]>(),
      ])
    } catch {
      /* empty */
    }
  }
  return (
    <>
      <TopBar title="Campaigns" searchPlaceholder="Search campaigns..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Outbound</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Campaigns</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Bulk dial a contact list with one of your agents. Concurrency, retry policy, and call windows are honoured.
          </p>
        </div>
        <CampaignsClient
          initialCampaigns={campaigns.map((c) => ({
            id: String(c._id),
            name: c.name,
            status: c.status,
            agentId: c.agentId ? String(c.agentId) : '',
            concurrency: c.concurrency,
            maxAttempts: c.maxAttempts,
            contactIds: (c.contactIds ?? []).map(String),
            stats: c.stats,
            fromE164: c.fromE164,
            createdAt: c.createdAt.toISOString(),
          }))}
          agents={agents.map((a) => ({ id: String(a._id), name: a.name, tier: a.tier }))}
          numbers={numbers.map((n) => ({ id: String(n._id), e164: n.e164, providerName: n.providerName }))}
        />
      </div>
    </>
  )
}
