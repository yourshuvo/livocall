import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

export function EmptyState({
  icon = 'sparkles',
  title,
  body,
  action,
  hint,
  className,
}: {
  icon?: IconName
  title: string
  body: string
  action?: React.ReactNode
  /** Optional caption below the action (e.g. "Takes ~2 min"). */
  hint?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-4 overflow-hidden p-12 text-center',
        className,
      )}
    >
      <div
        aria-hidden
        className="bg-grid-mono bg-grid-mono-fade pointer-events-none absolute inset-0 opacity-30"
      />
      <div className="relative grid size-14 place-items-center rounded-xl border border-line bg-bg shadow-card">
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-b from-bg-subtle to-bg"
        />
        <Icon name={icon} size="lg" className="text-fg" />
      </div>
      <div className="relative max-w-sm">
        <p className="font-display text-[17px] font-medium tracking-tighter text-fg">{title}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{body}</p>
      </div>
      {action && <div className="relative">{action}</div>}
      {hint && (
        <p className="relative font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
          {hint}
        </p>
      )}
    </div>
  )
}
