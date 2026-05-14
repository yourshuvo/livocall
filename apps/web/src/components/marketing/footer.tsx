import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { t, type Locale } from '@/lib/i18n'

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '#tiers', label: 'Call playbooks' },
      { href: '#business-impact', label: 'Business impact' },
      { href: '#flow', label: 'Revenue flow' },
      { href: '#pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/status', label: 'Status' },
      { href: '/overview', label: 'Dashboard' },
      { href: '/settings/indexes', label: 'Index verification' },
      { href: 'mailto:hello@livocall.ai', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/aup', label: 'Acceptable use' },
      { href: '/dnc', label: 'DNC controls' },
    ],
  },
]

export function MarketingFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t border-line bg-bg-subtle/40">
      <div className="mx-auto max-w-screen-xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-fg-muted">
              {t(locale, 'brand.tagline')}
            </p>
            <div className="mt-5 flex items-center gap-2 font-mono text-[11px] text-fg-faint">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-status-live opacity-50 animate-pulse-ring" />
                <span className="relative inline-flex size-1.5 rounded-full bg-status-live" />
              </span>
              Missed calls, COD, payments, handoffs, ROI
            </div>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">
                {col.title}
              </p>
              <ul className="mt-4 space-y-3 text-[13px] text-fg-muted">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="transition hover:text-fg">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 text-[12px] text-fg-faint md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} LivoCall — Dhaka & Singapore</span>
          <span className="font-mono">v0.4</span>
        </div>
      </div>
    </footer>
  )
}
