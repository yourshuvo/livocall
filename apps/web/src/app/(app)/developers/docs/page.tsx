import Link from 'next/link'
import { TopBar } from '@/components/app/top-bar'
import { Card, CardBody } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'

export const metadata = { title: 'API docs · LivoCall' }

const sections = [
  ['Calls', 'Start outbound calls, list call history, fetch transcripts and hang up live calls.'],
  ['Agents', 'List agents and reference agent ids in calls, campaigns and integrations.'],
  ['Campaigns', 'Create campaigns, attach contacts, start, pause and monitor attempts.'],
  ['Knowledge', 'Create KBs and attach uploaded files, URLs or text sources for agent answers.'],
  ['Numbers', 'Connect SIP usernames/passwords/domains for inbound and outbound calling.'],
  ['DNC', 'Automate opt-out and do-not-call compliance.'],
]

export default function ApiDocsPage() {
  return (
    <>
      <TopBar title="API documentation" searchPlaceholder="Search API docs..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Developers</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-fg">Automate anything with LivoCall API</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
            Use one Bearer API key to automate calls, agents, contacts, campaigns, SIP numbers,
            knowledge bases, DNC and webhooks from your CRM, website, Zapier, Make, n8n or custom app.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/developers" className="inline-flex items-center gap-1.5 rounded bg-fg px-3 py-1.5 text-[12.5px] font-medium text-fg-inverse">
              Create API key <Icon name="arrow-right" size="xs" />
            </Link>
            <a href="/api/v1/openapi.json" className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-[12.5px] font-medium text-fg">
              OpenAPI JSON
            </a>
          </div>
        </div>
        <div className="grid gap-4 px-6 py-6 lg:grid-cols-2">
          <Card>
            <CardBody className="space-y-3">
              <h2 className="font-display text-[18px] font-medium tracking-tight">Authentication</h2>
              <p className="text-[13px] text-fg-muted">Send API keys from Settings or Connections as Bearer tokens.</p>
              <pre className="overflow-x-auto rounded border border-line bg-bg-subtle p-3 font-mono text-[12px]">{`Authorization: Bearer lvo_...`}</pre>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3">
              <h2 className="font-display text-[18px] font-medium tracking-tight">Start a call</h2>
              <pre className="overflow-x-auto rounded border border-line bg-bg-subtle p-3 font-mono text-[12px]">{`curl -X POST https://your-host/api/v1/calls \\
  -H "Authorization: Bearer lvo_..." \\
  -H "Content-Type: application/json" \\
  -d '{"agent_id":"ag_123","to_e164":"+8801711000000"}'`}</pre>
            </CardBody>
          </Card>
          {sections.map(([title, desc]) => (
            <Card key={title}>
              <CardBody>
                <h3 className="font-medium text-fg">{title}</h3>
                <p className="mt-1 text-[13px] text-fg-muted">{desc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
