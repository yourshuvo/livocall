import { TopBar } from '@/components/app/top-bar'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { DncEntry, type DncEntryLean } from '@/models/DncEntry'
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card'
import { DncClient } from './client'

export const dynamic = 'force-dynamic'

export default async function DncPage() {
  const s = await getSession()
  let entries: DncEntryLean[] = []
  if (isMongoConfigured() && s.orgId) {
    try {
      await connectMongo()
      entries = await DncEntry.find({ orgId: s.orgId })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean<DncEntryLean[]>()
    } catch {
      /* empty */
    }
  }
  return (
    <>
      <TopBar title="Do-not-call list" searchPlaceholder="Search numbers..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Compliance</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Do-not-call list</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Numbers added here are blocked from every outbound originate — agent test calls, dashboard, public REST and connected plugins. BTRC opt-out keywords also flow into this list.
          </p>
        </div>
        <DncClient
          initial={entries.map((e) => ({
            id: String(e._id),
            e164: e.e164,
            reason: e.reason,
            note: e.note,
            createdAt: e.createdAt.toISOString(),
          }))}
        />
        <div className="grid gap-4 px-6 pb-8 md:grid-cols-3">
          <Card>
            <CardBody>
              <CardTitle>Speech opt-out</CardTitle>
              <CardDescription>
                Phrases like “stop calling” and “remove me” can flow into this DNC list from the voice worker.
              </CardDescription>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>PII redaction</CardTitle>
              <CardDescription>
                Transcript/export redaction is controlled from Settings → Workspace compliance.
              </CardDescription>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Audit trail</CardTitle>
              <CardDescription>
                DNC mutations and compliance setting changes are written to the admin audit log.
              </CardDescription>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
