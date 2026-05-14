import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export const metadata = { title: 'Password reset · LivoCall' }

export default function PasswordResetPage() {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">
        Reset password
      </p>
      <h1 className="mt-2 font-display text-[34px] font-medium leading-[1.04] tracking-tightest text-fg">
        Recover your workspace access.
      </h1>
      <p className="mt-2 text-[13px] text-fg-muted">
        Use the account recovery flow, then return to your agents, campaigns, monitoring, and compliance dashboard.
      </p>
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-bg-subtle p-4 text-[12px] text-fg-muted">
        <Icon name="shield-check" size="sm" square />
        <span>Your workspace features stay protected while account access is recovered.</span>
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
