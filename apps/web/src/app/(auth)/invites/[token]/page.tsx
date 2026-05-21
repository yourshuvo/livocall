import Link from 'next/link'
import { AcceptInviteForm } from './form'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { Invite } from '@/models/Invite'
import { Org } from '@/models/Org'
import { hashToken } from '@/lib/tokens'
import { Icon } from '@/components/ui/icon'

export const metadata = { title: 'Invite - LivoCall' }
export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isMongoConfigured()) {
    return <InvalidInvite reason="Mongo is not configured." />
  }
  await connectMongo()
  const now = new Date()
  const invite = await Invite.findOne({ tokenHash: hashToken(token) }).lean()
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < now) {
    return <InvalidInvite reason="This invite is invalid or has expired." />
  }
  const org = await Org.findById(invite.orgId).lean()
  if (!org) return <InvalidInvite reason="That workspace no longer exists." />

  return (
    <div>
      <p className="text-fg-faint font-mono text-[11px] uppercase tracking-[0.16em]">Invitation</p>
      <h1 className="font-display tracking-tightest text-fg mt-2 text-[34px] font-medium leading-[1.04]">
        Join {org.name}.
      </h1>
      <p className="text-fg-muted mt-2 text-[13px]">
        Invited to <span className="text-fg font-mono">{invite.email}</span> as{' '}
        <span className="text-fg font-mono">{String(invite.role)}</span>.
      </p>
      <div className="border-line bg-bg-subtle mt-6 rounded-xl border p-3">
        {[
          { icon: 'bot', label: 'Work on shared voice agents' },
          { icon: 'book', label: 'Review knowledge sources and ingestion status' },
          { icon: 'activity', label: 'Monitor campaigns, calls, and compliance events' },
        ].map((item) => (
          <div
            key={item.label}
            className="border-line text-fg-muted flex items-center gap-3 border-b py-2 text-[12px] last:border-b-0"
          >
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
      <h1 className="font-display text-fg text-[28px]">Invite unavailable</h1>
      <p className="text-fg-muted mt-2 text-[13px]">{reason}</p>
      <p className="mt-6">
        <Link href="/" className="text-fg underline-offset-4 hover:underline">
          Back home
        </Link>
      </p>
    </div>
  )
}
