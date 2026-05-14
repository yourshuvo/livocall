import Link from 'next/link'
import { SignUp } from '@clerk/nextjs'
import { Icon } from '@/components/ui/icon'

export const metadata = { title: 'Create account - LivoCall' }

function safeRedirect(searchParams?: { redirect_url?: string | string[] }) {
  const value = Array.isArray(searchParams?.redirect_url)
    ? searchParams?.redirect_url[0]
    : searchParams?.redirect_url
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/overview'
}

export default function SignupPage({ searchParams }: { searchParams?: { redirect_url?: string | string[] } }) {
  const redirectUrl = safeRedirect(searchParams)
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">
        Create account
      </p>
      <h1 className="mt-2 font-display text-[34px] font-medium leading-[1.04] tracking-tightest text-fg">
        Create your workspace.
      </h1>
      <p className="mt-2 text-[13px] text-fg-muted">
        Start with a workspace, then create agents, add knowledge, launch campaigns, monitor calls, and enforce compliance controls.
      </p>
      <div className="mt-6 rounded-xl border border-line bg-bg-subtle p-3">
        {[
          { icon: 'bot', label: 'Create your first Bangla/English voice agent' },
          { icon: 'book', label: 'Attach PDFs, DOCX, websites, and text sources' },
          { icon: 'bar-chart', label: 'Track cost, latency, conversion, and KB gaps' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 border-b border-line py-2 text-[12px] text-fg-muted last:border-b-0">
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
          appearance={{
            elements: {
              rootBox: 'w-full',
              cardBox: 'w-full shadow-none',
              card: 'w-full border border-line bg-bg shadow-none',
              footer: 'hidden',
            },
          }}
        />
      </div>
      <p className="mt-6 text-[13px] text-fg-muted">
        Already have an account?{' '}
        <Link href={`/login?redirect_url=${encodeURIComponent(redirectUrl)}`} className="text-fg underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
