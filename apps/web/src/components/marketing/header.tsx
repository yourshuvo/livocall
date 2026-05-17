import Link from 'next/link'
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { LangSwitcher } from '@/components/lang-switcher'
import { t, type Locale } from '@/lib/i18n'

const NAV_ITEMS = [
  { href: '#business-impact', label: 'Business impact', icon: 'sparkles' },
  { href: '#tiers', label: 'Call playbooks', icon: 'phone-call' },
  { href: '#flow', label: 'Revenue flow', icon: 'route' },
  { href: '#pricing', label: 'Pricing', icon: 'wallet' },
] as const

export function MarketingHeader({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-screen-xl items-center justify-between gap-4 px-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Link href="/" className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 shadow-sm transition hover:border-fg/20">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 rounded-2xl border border-line bg-bg-subtle/80 p-1 shadow-sm lg:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium text-fg-muted transition hover:bg-bg hover:text-fg hover:shadow-card"
              >
                <Icon name={item.icon} size="xs" square={false} className="text-fg-faint transition group-hover:text-fg" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 rounded-full border border-line bg-bg-subtle px-3 py-1.5 text-[11px] text-fg-muted md:flex">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-status-live opacity-50 animate-pulse-ring" />
            <span className="relative inline-flex size-1.5 rounded-full bg-status-live" />
          </span>
          <span className="font-mono uppercase tracking-[0.12em]">Orders · payments · handoffs</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <LangSwitcher locale={locale} />
          </div>
          <SignedOut>
            <Link href="/login" className="hidden rounded-full px-3 py-2 text-[13px] text-fg-muted transition hover:bg-bg-subtle hover:text-fg sm:inline">
                {t(locale, 'nav.signin')}
            </Link>
            <Button asChild size="sm" className="rounded-full px-4">
              <Link href="/signup">
                {t(locale, 'nav.start')}
                <Icon name="arrow-right" size="xs" square={false} />
              </Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Link
              href="/overview"
              className="hidden rounded-full bg-fg px-4 py-2 text-[13px] text-fg-inverse transition hover:bg-fg-strong sm:inline"
            >
              Dashboard
            </Link>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  )
}
