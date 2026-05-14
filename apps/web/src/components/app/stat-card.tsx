import { Card, CardBody } from '@/components/ui/card'
import { Sparkline } from '@/components/ui/sparkline'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

export function StatCard({
  label,
  value,
  delta,
  series,
  icon,
  hint,
}: {
  label: string
  value: string
  delta?: { value: string; positive?: boolean }
  series?: number[]
  icon?: IconName
  /** Optional secondary hint shown below the value (e.g. "vs last 24h"). */
  hint?: string
}) {
  return (
    <Card className="group relative overflow-hidden transition-colors hover:border-fg/15">
      <div
        aria-hidden
        className="bg-grid-mono bg-grid-mono-fade pointer-events-none absolute inset-0 opacity-25"
      />
      <CardBody className="relative flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">
            {label}
          </p>
          {icon && (
            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-bg-subtle text-fg-muted transition group-hover:text-fg">
              <Icon name={icon} size="sm" />
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="font-display text-[28px] font-medium leading-none tracking-tightest text-fg">
            {value}
          </p>
          {series && series.length > 1 && (
            <Sparkline values={series} positive={delta?.positive ?? true} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium',
                delta.positive
                  ? 'bg-status-live-soft text-status-live'
                  : 'bg-status-fail-soft text-status-fail',
              )}
            >
              <Icon
                name={delta.positive ? 'arrow-up-right' : 'arrow-down-right'}
                size="xs"
              />
              {delta.value}
            </span>
          )}
          {hint && (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
              {hint}
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
