import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icon'
import { t, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

interface Tier {
  key: 'tier1' | 'tier2' | 'tier3'
  badge: string
  icon: IconName
  featured?: boolean
}

const TIERS: Tier[] = [
  { key: 'tier1', badge: 'Retain', icon: 'headset' },
  { key: 'tier2', badge: 'Convert', icon: 'megaphone', featured: true },
  { key: 'tier3', badge: 'Collect', icon: 'hash' },
]

const HIGHLIGHTS: Record<Tier['key'], string[]> = {
  tier1: ['Reduce support backlog', 'Escalate high-value callers', 'Best for retention and complex questions'],
  tier2: ['Confirm COD and appointments', 'Qualify leads before sales calls', 'Best for revenue-driving outreach'],
  tier3: ['Automate payment reminders', 'Retry on no-answer', 'Best for invoices, renewals, and simple updates'],
}

export function TierCards({ locale }: { locale: Locale }) {
  const bangla = locale === 'bn'
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
      {TIERS.map((tier) => (
        <div
          key={tier.key}
          className={cn(
            'group relative flex flex-col gap-6 bg-bg p-6 transition',
            tier.featured && 'bg-bg-subtle',
          )}
        >
          {tier.featured && (
            <span className="absolute right-4 top-4 rounded-full bg-fg px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-fg-inverse">
              recommended
            </span>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-md border border-line bg-bg">
                <Icon name={tier.icon} size="md" square={false} />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
                {tier.badge} · {t(locale, `${tier.key}.tag`).split('·').slice(1).join('·').trim()}
              </span>
            </div>
          </div>

          <div>
            <h3
              className={cn(
                'font-display text-[26px] font-medium leading-[1.05] tracking-tightest text-fg',
                bangla && 'font-bangla',
              )}
            >
              {t(locale, `${tier.key}.name`)}
            </h3>
            <p className={cn('mt-2 text-[13.5px] leading-relaxed text-fg-muted', bangla && 'font-bangla')}>
              {t(locale, `${tier.key}.desc`)}
            </p>
          </div>

          <ul className="flex-1 space-y-2 border-t border-line pt-5 text-[13px] text-fg">
            {HIGHLIGHTS[tier.key].map((h) => (
              <li key={h} className="flex items-start gap-2">
                <span className="mt-1 inline-block size-1 shrink-0 rounded-full bg-fg" />
                <span className={cn(bangla && 'font-bangla')}>{h}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-end justify-between border-t border-line pt-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                from
              </p>
              <p className={cn('mt-1 font-display text-xl font-medium tracking-tighter text-fg', bangla && 'font-bangla')}>
                {t(locale, `${tier.key}.price`)}
              </p>
            </div>
            <Link
              href="/signup"
                className={cn(
                  'inline-flex items-center gap-1 text-[13px] font-medium text-fg transition hover:gap-2',
                )}
            >
                {bangla ? 'ব্যবসায় ব্যবহার' : 'Use for business'}
                <Icon name="arrow-up-right" size="sm" square={false} />
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
