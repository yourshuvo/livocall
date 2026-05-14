'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Show } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export function AcceptInviteForm({
  token,
}: {
  token: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const redirectParam = encodeURIComponent(`/invites/${token}`)

  async function acceptInvite() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/invites/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    setLoading(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j?.error?.message || j.error || 'Accept failed.')
      return
    }
    router.push('/overview')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <Show when="signed-out">
        <p className="rounded-md border border-line bg-bg-subtle px-4 py-3 text-[13px] text-fg-muted">
          Sign in or sign up with the invited email, then accept the workspace invitation to access its features.
        </p>
        <div className="grid gap-2">
          <Button asChild size="lg" className="w-full">
            <Link href={`/login?redirect_url=${redirectParam}`}>
              Sign in
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="w-full">
            <Link href={`/signup?redirect_url=${redirectParam}`}>
              Sign up
            </Link>
          </Button>
        </div>
      </Show>
      <Show when="signed-in">
        <div className="mb-3 flex items-center gap-2 rounded-md border border-line bg-bg-subtle px-4 py-3 text-[12px] text-fg-muted">
          <Icon name="check-badge" size="sm" />
          <span>Ready to join this feature workspace.</span>
        </div>
        <Button type="button" onClick={acceptInvite} disabled={loading} className="w-full" size="lg">
          {loading ? 'Accepting…' : 'Accept invitation'}
        </Button>
      </Show>
      {error && <p className="text-sm text-status-fail">{error}</p>}
    </div>
  )
}
