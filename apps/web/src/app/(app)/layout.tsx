import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { Sidebar, type WorkspaceSummary } from '@/components/app/sidebar'
import { ToastProvider } from '@/components/ui/toast'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { ensureDashboardUser } from '@/lib/session'
import { Org, type OrgLean } from '@/models/Org'
import { Membership } from '@/models/Membership'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) {
    redirect('/login?redirect_url=/overview')
  }
  const session = await ensureDashboardUser()
  if (!session.userId || !session.orgId) {
    redirect('/login?redirect_url=/overview')
  }

  let orgName = 'Workspace'
  let creditsPaisa = 0
  let memberships: WorkspaceSummary[] = []
  if (isMongoConfigured()) {
    try {
      await connectMongo()
      const [org, mships] = await Promise.all([
        Org.findById(session.orgId).lean<OrgLean>(),
        Membership.find({ userId: session.userId })
          .populate<{ orgId: { _id: string; name: string; slug: string } }>({
            path: 'orgId',
            select: 'name slug',
          })
          .lean(),
      ])
      if (org) {
        orgName = org.name
        creditsPaisa = org.creditsPaisa
      }
      memberships = mships
        .filter((m) => m.orgId && typeof m.orgId === 'object')
        .map((m) => ({
          orgId: String(m.orgId._id),
          orgName: m.orgId.name,
          role: String(m.role),
        }))
    } catch {
      // dashboard still renders if Mongo is briefly down
    }
  }

  return (
    <ToastProvider>
      <div className="flex h-dvh bg-bg">
        <Sidebar
          orgName={orgName}
          orgId={String(session.orgId)}
          email={session.email || ''}
          role={session.role ?? 'agent'}
          creditsPaisa={creditsPaisa}
          memberships={memberships}
        />
        <main className="min-w-0 flex-1 overflow-y-auto bg-bg pb-16 md:pb-0">{children}</main>
      </div>
    </ToastProvider>
  )
}
