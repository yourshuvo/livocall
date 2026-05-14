import { notFound } from 'next/navigation'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Agent, type AgentLean } from '@/models/Agent'
import { KnowledgeBase, type KnowledgeBaseLean } from '@/models/KnowledgeBase'
import { PhoneNumber, type PhoneNumberLean } from '@/models/PhoneNumber'
import { agentToJson, kbToJson } from '@/lib/serialize'
import { AgentEditor } from './editor-client'

export const dynamic = 'force-dynamic'

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  if (!isMongoConfigured()) notFound()
  const session = await getSession()
  await connectMongo()
  const [agent, kbs, numbers] = await Promise.all([
    Agent.findOne({ _id: params.id, orgId: session.orgId }).lean<AgentLean>(),
    KnowledgeBase.find({ orgId: session.orgId }).sort({ name: 1 }).lean<KnowledgeBaseLean[]>(),
    PhoneNumber.find({ orgId: session.orgId, outboundEnabled: true }).sort({ e164: 1 }).lean<PhoneNumberLean[]>(),
  ])
  if (!agent) notFound()

  return (
    <AgentEditor
      initial={agentToJson(agent) as never}
      kbs={kbs.map((k) => kbToJson(k)) as never}
      numbers={numbers.map((n) => ({ id: String(n._id), e164: n.e164, providerName: n.providerName }))}
    />
  )
}
