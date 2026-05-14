import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

interface Metric {
  icon: IconName
  label: string
  value: string
  caption?: string
}

const DEFAULT_METRICS: Metric[] = [
  { icon: 'activity', label: 'Round-trip', value: '~80 ms', caption: 'Singapore voice node' },
  { icon: 'currency', label: 'From', value: '৳0.85 / min', caption: 'paisa-precise billing' },
  { icon: 'shield', label: 'Compliance', value: 'BTRC-aware', caption: 'DNC + opt-out built-in' },
  { icon: 'globe', label: 'Languages', value: 'Bangla + English', caption: 'tuned for BD dialects' },
]

export function MetricStrip({
  metrics = DEFAULT_METRICS,
  className,
}: {
  metrics?: Metric[]
  className?: string
}) {
  return (
    <ul className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {metrics.map((m, i) => (
        <li
          key={m.label}
          className="group relative overflow-hidden rounded-lg border border-line bg-bg/80 p-3 backdrop-blur-sm transition hover:border-fg/30 animate-fade-up"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
              <Icon name={m.icon} size="sm" />
            </span>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-faint">
              {m.label}
            </p>
          </div>
          <p className="mt-2 font-display text-[18px] font-medium tracking-tighter text-fg">
            {m.value}
          </p>
          {m.caption && (
            <p className="mt-0.5 text-[11px] text-fg-muted">{m.caption}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
