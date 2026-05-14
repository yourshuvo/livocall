import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { PhoneNumber, type PhoneNumberLean } from '@/models/PhoneNumber'
import { Agent, type AgentLean } from '@/models/Agent'
import { phoneNumberToJson } from '@/lib/serialize'
import { NumbersClient } from './client'

export const dynamic = 'force-dynamic'

export default async function NumbersPage() {
  const session = await getSession()
  let numbers: PhoneNumberLean[] = []
  let agents: AgentLean[] = []
  if (isMongoConfigured()) {
    try {
      await connectMongo()
      ;[numbers, agents] = await Promise.all([
        PhoneNumber.find({ orgId: session.orgId }).sort({ createdAt: -1 }).lean<PhoneNumberLean[]>(),
        Agent.find({ orgId: session.orgId }).sort({ name: 1 }).lean<AgentLean[]>(),
      ])
    } catch {
      // empty
    }
  }
  return (
    <>
      <TopBar title="Phone numbers" searchPlaceholder="Search numbers..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Telephony</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Phone numbers</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Add any SIP provider by entering your number, username, password, and SIP server.
          </p>
        </div>
        <div className="px-6 py-6">
          <NumbersClient
            initial={numbers.map((n) => phoneNumberToJson(n)) as never}
            agents={agents.map((a) => ({ id: String(a._id), name: a.name }))}
          />
        </div>
      </div>
    </>
  )
}
