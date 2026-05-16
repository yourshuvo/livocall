import Link from 'next/link'
import { AcceptInviteForm } from './form'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { Invite } from '@/models/Invite'
import { Org } from '@/models/Org'
import { hashToken } from '@/lib/tokens'
import { Icon } from '@/components/ui/icon'

export const metadata = { title: 'Invite · LivoCall' }
export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!isMongoConfigured()) {
    return <InvalidInvite reason="Mongo is not configured." />
  }
  await connectMongo()
  const invite = await Invite.findOne({ tokenHash: hashToken(token) }).lean()
  if (
    !invite ||
    invite.acceptedAt ||
    invite.revokedAt ||
    invite.expiresAt.getTime() < Date.now()
  ) {
    return <InvalidInvite reason="This invite is invalid or has expired." />
  }
  const org = await Org.findById(invite.orgId).lean()
  if (!org) return <InvalidInvite reason="That workspace no longer exists." />

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">
        Invitation
      </p>
      <h1 className="mt-2 font-display text-[34px] font-medium leading-[1.04] tracking-tightest text-fg">
        Join {org.name}.
      </h1>
      <p className="mt-2 text-[13px] text-fg-muted">
        Invited to <span className="font-mono text-fg">{invite.email}</span> as{' '}
        <span className="font-mono text-fg">{String(invite.role)}</span>.
      </p>
      <div className="mt-6 rounded-xl border border-line bg-bg-subtle p-3">
        {[
          { icon: 'bot', label: 'Work on shared voice agents' },
          { icon: 'book', label: 'Review knowledge sources and ingestion status' },
          { icon: 'activity', label: 'Monitor campaigns, calls, and compliance events' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 border-b border-line py-2 text-[12px] text-fg-muted last:border-b-0">
            <Icon name={item.icon as 'bot'} size="sm" square />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <AcceptInviteForm token={token} />
      </div>
    </div>
  )
}

function InvalidInvite({ reason }: { reason: string }) {
  return (
    <div>
      <h1 className="font-display text-[28px] text-fg">Invite unavailable</h1>
      <p className="mt-2 text-[13px] text-fg-muted">{reason}</p>
      <p className="mt-6">
        <Link href="/" className="text-fg underline-offset-4 hover:underline">
          Back home
        </Link>
      </p>
    </div>
  )
}
