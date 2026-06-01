import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Call } from '@/models/Call'
import { Agent } from '@/models/Agent'
import { callToJson } from '@/lib/serialize'
import { MonitoringClient, type MonitoringCall } from './client'

export const dynamic = 'force-dynamic'

export default async function MonitoringPage() {
  const session = await getSession()
  let calls: MonitoringCall[] = []
  let agentNames: Record<string, string> = {}

  if (isMongoConfigured()) {
    try {
      await connectMongo()
      const [rawCalls, agents] = await Promise.all([
        Call.find({ orgId: session.orgId, outcome: 'in_progress' })
          .sort({ startedAt: -1 })
          .limit(50)
          .lean(),
        Agent.find({ orgId: session.orgId }).lean(),
      ])
      calls = rawCalls.map((call) => {
        const json = callToJson(call)
        return {
          id: json.id || '',
          agentId: json.agentId,
          fromE164: json.fromE164,
          toE164: json.toE164,
          startedAt: json.startedAt,
          transcript: json.transcript,
          metadata: json.metadata,
        }
      })
      agentNames = Object.fromEntries(agents.map((agent) => [String(agent._id), agent.name]))
    } catch {
      // Empty state.
    }
  }

  return (
    <>
      <TopBar title="Live monitoring" searchPlaceholder="Search live calls..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
            Supervisor
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">
            Live call monitoring
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Supervisor view for live transcripts, listen, whisper, and barge controls.
          </p>
        </div>
        <MonitoringClient initialCalls={calls} agentNames={agentNames} />
      </div>
    </>
  )
}
