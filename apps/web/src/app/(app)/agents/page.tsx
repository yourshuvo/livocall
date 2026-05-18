import Link from 'next/link'
import { Suspense } from 'react'
import { Icon } from '@/components/ui/icon'
import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Agent, type AgentLean } from '@/models/Agent'
import { PhoneNumber, type PhoneNumberLean } from '@/models/PhoneNumber'
import { type Tier } from '@/types/agent'
import { fmtDate, fmtPhoneE164 } from '@/lib/format'
import { AgentsImportButton } from './import-button'
import { CreateAgentButton } from './create-agent-button'

export const dynamic = 'force-dynamic'

const AGENT_TYPE_LABEL: Record<Tier, string> = {
  gemini_live: 'Single Prompt',
  grok_voice: 'Grok Voice',
  pipeline: 'Conversation Flow',
  dtmf: 'IVR Flow',
}

const AGENT_TYPE_TONE: Record<Tier, string> = {
  gemini_live: 'bg-violet-50 text-violet-700 ring-violet-200',
  grok_voice: 'bg-zinc-100 text-zinc-800 ring-zinc-300',
  pipeline: 'bg-sky-50 text-sky-700 ring-sky-200',
  dtmf: 'bg-amber-50 text-amber-700 ring-amber-200',
}

export default async function AgentsPage() {
  const session = await getSession()
  let agents: AgentLean[] = []
  let phoneNumbers: PhoneNumberLean[] = []
  let loadError = ''
  if (isMongoConfigured()) {
    try {
      await connectMongo()
      ;[agents, phoneNumbers] = await Promise.all([
        Agent.find({ orgId: session.orgId })
          .sort({ updatedAt: -1 })
          .lean<AgentLean[]>(),
        PhoneNumber.find({ orgId: session.orgId, agentId: { $exists: true, $ne: null } })
          .sort({ updatedAt: -1 })
          .lean<PhoneNumberLean[]>(),
      ])
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Agents failed to load'
    }
  }

  const phoneByAgent = phoneNumbers.reduce((map, phone) => {
    if (!phone.agentId) return map
    const agentId = String(phone.agentId)
    map.set(agentId, [...(map.get(agentId) ?? []), phone.e164])
    return map
  }, new Map<string, string[]>())

  const editorInitial = (session.email || 'L').charAt(0).toUpperCase()
  const editorHandle = (session.email || 'livocall').split('@')[0]

  return (
    <>
      <TopBar
        title="All Agents"
        searchPlaceholder="Search..."
        actions={
          <>
            <Suspense>
              <AgentsImportButton />
            </Suspense>
            <CreateAgentButton className="h-8 rounded-[5px] px-3 text-[12.5px] tracking-normal">
              Create an Agent
            </CreateAgentButton>
          </>
        }
      />
      <div className="flex-1 overflow-y-auto bg-bg">
        {loadError && (
          <div className="border-b border-status-fail/30 bg-status-fail/5 px-6 py-3 text-[13px] text-status-fail">
            Couldn’t load agents: {loadError}
          </div>
        )}
        <div className="px-6 py-5">
          {agents.length === 0 ? (
            <EmptyAgents />
          ) : (
            <AgentsTable
              agents={agents}
              phoneByAgent={phoneByAgent}
              editorInitial={editorInitial}
              editorHandle={editorHandle}
            />
          )}
        </div>
      </div>
    </>
  )
}

function AgentsTable({
  agents,
  phoneByAgent,
  editorInitial,
  editorHandle,
}: {
  agents: AgentLean[]
  phoneByAgent: Map<string, string[]>
  editorInitial: string
  editorHandle: string
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[12px] text-fg-muted">
              <th className="px-4 py-2.5 text-left font-normal">Agent Name</th>
              <th className="px-4 py-2.5 text-left font-normal">Agent Type</th>
              <th className="px-4 py-2.5 text-left font-normal">Voice</th>
              <th className="px-4 py-2.5 text-left font-normal">Phone</th>
              <th className="px-4 py-2.5 text-left font-normal">Edited by</th>
              <th className="px-4 py-2.5 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const typeLabel = AGENT_TYPE_LABEL[a.tier]
              const typeTone = AGENT_TYPE_TONE[a.tier]
              const phones = phoneByAgent.get(String(a._id)) ?? []
              return (
                <tr
                  key={String(a._id)}
                  className="border-t border-line/70 transition hover:bg-bg-subtle/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/agents/${a._id}`}
                      className="flex items-center gap-2 text-fg hover:text-fg"
                    >
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-sky-600 text-[10px] font-semibold text-white">
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate font-medium">{truncateMiddle(a.name, 18)}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-[4px] px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${typeTone}`}
                    >
                      {typeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-5 rounded-full bg-gradient-to-br from-rose-300 to-rose-500"
                        aria-hidden
                      />
                      <span className="truncate text-fg">{voiceLabel(a)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {phones.length ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] text-fg">
                          {fmtPhoneE164(phones[0])}
                        </span>
                        {phones.length > 1 && (
                          <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[10.5px] text-fg-muted">
                            +{phones.length - 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-fg-faint">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    <div className="flex items-center gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[10px] font-semibold text-white">
                        {editorInitial}
                      </span>
                      <span className="truncate">{editorHandle}</span>
                      <span className="text-fg-faint">·</span>
                      <span className="text-fg-muted">{fmtDate(a.updatedAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/agents/${a._id}`}
                      className="inline-flex h-7 items-center rounded-[5px] px-2 text-[12px] text-fg-muted transition hover:bg-bg-muted hover:text-fg"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function EmptyAgents() {
  return (
    <div className="rounded-[8px] border border-dashed border-line bg-bg-subtle/40 px-6 py-16 text-center">
      <span className="mx-auto mb-3 grid size-9 place-items-center rounded-[6px] border border-line bg-bg text-fg-subtle">
        <Icon name="bot" size="md" />
      </span>
      <h2 className="text-[15px] font-semibold text-fg">Build your first agent</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-fg-muted">
        Pick an engine tier, write a system prompt, choose a voice — we'll wire up the SIP and AI
        plumbing. First call lands in under 5 minutes.
      </p>
      <CreateAgentButton className="mt-4 h-8 rounded-[5px] px-3 text-[12.5px] tracking-normal">
        Create an Agent
      </CreateAgentButton>
    </div>
  )
}

function truncateMiddle(s: string, max: number) {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function voiceLabel(a: AgentLean) {
  const v = a.voice
  if (v && typeof v === 'object') {
    const id = v.voiceId || v.style || v.provider
    if (id) return id
  }
  return 'Cimo'
}
