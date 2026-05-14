import { TopBar } from '@/components/app/top-bar'
import { getSession } from '@/lib/session'
import { MembersClient } from './client'

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
  const session = await getSession()
  const canAdmin = session.role === 'owner' || session.role === 'admin'

  return (
    <>
      <TopBar title="Members" searchPlaceholder="Search members..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
            Settings
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">
            Team members
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Invite teammates, review pending invites, and manage workspace roles.
          </p>
        </div>
        <div className="px-6 py-6">
          <MembersClient canAdmin={canAdmin} currentUserId={session.userId || ''} />
        </div>
      </div>
    </>
  )
}