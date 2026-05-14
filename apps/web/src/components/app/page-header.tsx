import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

export interface Crumb {
  label: string
  href?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
  crumbs,
  meta,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
  /** Optional icon rendered as a hairline tile next to the title. */
  icon?: IconName
  /** Breadcrumb trail rendered above the title. */
  crumbs?: Crumb[]
  /** Inline meta chips rendered under the title (badges, status pills, etc). */
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'relative flex flex-col gap-4 border-b border-line bg-bg px-8 py-6 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div
        aria-hidden
        className="bg-grid-mono bg-grid-mono-fade pointer-events-none absolute inset-0 opacity-[0.35]"
      />
      <div className="relative">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2.5">
            <ol className="flex flex-wrap items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
              {crumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                  {c.href ? (
                    <a className="transition hover:text-fg" href={c.href}>
                      {c.label}
                    </a>
                  ) : (
                    <span>{c.label}</span>
                  )}
                  {i < crumbs.length - 1 && (
                    <Icon name="chevron-right" size="xs" className="text-fg-faint/70" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {eyebrow && (
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">
            {eyebrow}
          </p>
        )}

        <div className={cn('flex items-center gap-3', eyebrow && 'mt-1.5')}>
          {icon && (
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-bg-subtle text-fg shadow-card">
              <Icon name={icon} size="md" />
            </span>
          )}
          <h1 className="font-display text-[26px] font-medium tracking-tightest text-fg md:text-[30px]">
            {title}
          </h1>
        </div>

        {description && (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-fg-muted">
            {description}
          </p>
        )}

        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && (
        <div className="relative flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  )
}
