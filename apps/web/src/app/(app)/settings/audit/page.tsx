import { TopBar } from '@/components/app/top-bar'
import { getSession } from '@/lib/session'
import { AuditClient } from './client'

export const dynamic = 'force-dynamic'

export default async function AuditLogPage() {
  const session = await getSession()
  const canAdmin = session.role === 'owner' || session.role === 'admin'

  return (
    <>
      <TopBar title="Audit log" searchPlaceholder="Search audit events..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Account</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Audit log</h1>
          <p className="mt-1 text-[13px] text-fg-muted">Append-only log of workspace mutations.</p>
        </div>
        <div className="px-6 py-6">
          {!canAdmin ? (
            <p className="rounded-md border border-line bg-bg-subtle px-4 py-3 text-[13px] text-fg-muted">
              Audit log is only visible to owners and admins.
            </p>
          ) : (
            <AuditClient />
          )}
        </div>
      </div>
    </>
  )
}
