import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export const metadata = { title: 'Choose a new password · LivoCall' }
export const dynamic = 'force-dynamic'

export default function PasswordResetConfirm() {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">
        New password
      </p>
      <h1 className="mt-2 font-display text-[34px] font-medium leading-[1.04] tracking-tightest text-fg">
        Continue to your workspace.
      </h1>
      <p className="mt-2 text-[13px] text-fg-muted">
        Finish account recovery and continue to the workspace where agents, KB files, campaigns, live monitoring, and audit controls live.
      </p>
      <div className="mt-6 grid gap-2">
        {['Agents stay connected', 'Campaign history remains available', 'Compliance settings stay enforced'].map((label) => (
          <div key={label} className="flex items-center gap-2 text-[12px] text-fg-muted">
            <Icon name="check" size="xs" />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Button asChild size="lg" className="w-full">
          <Link href="/login">
            Open sign in
          </Link>
        </Button>
      </div>
    </div>
  )
}
