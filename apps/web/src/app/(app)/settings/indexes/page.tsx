import { TopBar } from '@/components/app/top-bar'
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card'
import { getSession } from '@/lib/session'
import { IndexVerifier } from './verifier'

export const dynamic = 'force-dynamic'

export default async function IndexesPage() {
  const session = await getSession()
  const canRun = session.role === 'owner'
  return (
    <>
      <TopBar title="Index verification" searchPlaceholder="Search indexes..." />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="border-b border-line/70 px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Production</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Migration/index verification</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Ensures indexes for auth, secrets, KB, campaign, compliance, and call models exist before production traffic.
          </p>
        </div>
        <div className="px-6 py-6">
          <Card>
            <div className="border-b border-line p-5">
              <CardTitle>MongoDB indexes</CardTitle>
              <CardDescription>Owner-only createIndexes check for all production models.</CardDescription>
            </div>
            <CardBody>
              {canRun ? (
                <IndexVerifier />
              ) : (
                <p className="text-[13px] text-fg-muted">Only workspace owners can run index verification.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
