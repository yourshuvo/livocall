import Link from 'next/link'
import { SignUp } from '@clerk/nextjs'
import { Icon } from '@/components/ui/icon'
import { clerkAuthPageAppearance } from '@/lib/clerk-appearance'

export const metadata = { title: 'Create account - LivoCall' }

function safeRedirect(searchParams?: { redirect_url?: string | string[] }) {
  const value = Array.isArray(searchParams?.redirect_url)
    ? searchParams?.redirect_url[0]
    : searchParams?.redirect_url
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/overview'
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirect_url?: string | string[] }>
}) {
  const redirectUrl = safeRedirect(await searchParams)
  return (
    <div>
      <p className="text-fg-faint font-mono text-[11px] uppercase tracking-[0.16em]">
        Create account
      </p>
      <h1 className="font-display tracking-tightest text-fg mt-2 text-[34px] font-medium leading-[1.04]">
        Create your workspace.
      </h1>
      <p className="text-fg-muted mt-2 text-[13px]">
        Start with a workspace, then create agents, add knowledge, launch campaigns, monitor calls,
        and enforce compliance controls.
      </p>
      <div className="border-line bg-bg-subtle mt-6 rounded-xl border p-3">
        {[
          { icon: 'bot', label: 'Create your first Bangla/English voice agent' },
          { icon: 'book', label: 'Attach PDFs, DOCX, websites, and text sources' },
          { icon: 'bar-chart', label: 'Track cost, latency, conversion, and KB gaps' },
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
      <div className="mt-8 flex justify-center">
        <SignUp
          path="/signup"
          routing="path"
          forceRedirectUrl={redirectUrl}
          signInUrl="/login"
          appearance={clerkAuthPageAppearance}
        />
      </div>
      <p className="text-fg-muted mt-6 text-[13px]">
        Already have an account?{' '}
        <Link
          href={`/login?redirect_url=${encodeURIComponent(redirectUrl)}`}
          className="text-fg underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
