'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

export interface SubNavGroup {
  label: string
  /** When true, render a `+` action next to the group label. */
  addable?: boolean
  items: SubNavItem[]
}

export interface SubNavItem {
  href: string
  label: string
  icon?: IconName
}

/**
 * Secondary rail rendered between the primary sidebar and the page content.
 * Used to host context-specific sub-routes (e.g. folders for Agents, saved
 * filters for Calls, etc).
 */
export function SubNav({
  title,
  rootHref,
  groups,
}: {
  title: string
  /** Active link rendered above the groups (e.g. "All Agents"). */
  rootHref: string
  groups: SubNavGroup[]
}) {
  const pathname = usePathname()
  const rootActive = pathname === rootHref
  return (
    <aside className="hidden h-screen w-[200px] shrink-0 flex-col border-r border-line bg-bg-subtle/50 md:flex">
      <div className="flex h-12 items-center justify-between border-b border-line px-3">
        <Link
          href={rootHref}
          className={cn(
            'flex items-center gap-2 rounded-[5px] px-2 py-1 text-[13px] transition',
            rootActive
              ? 'bg-bg font-medium text-fg shadow-card'
              : 'text-fg-muted hover:bg-bg/60 hover:text-fg',
          )}
        >
          <Icon name="folder" size="sm" className="text-fg-subtle" strokeWidth={1.6} />
          <span className="flex-1">{title}</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="flex items-center justify-between px-2 pb-1">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
                {group.label}
              </p>
              {group.addable && (
                <button
                  type="button"
                  aria-label={`Add ${group.label}`}
                  className="grid size-4 place-items-center rounded-sm text-fg-faint transition hover:bg-bg-muted hover:text-fg"
                >
                  <Icon name="plus" size="xs" />
                </button>
              )}
            </div>
            <ul className="space-y-px">
              {group.items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + '/')
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={cn(
                        'flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[13px] transition',
                        active
                          ? 'bg-bg font-medium text-fg shadow-card'
                          : 'text-fg-muted hover:bg-bg/60 hover:text-fg',
                      )}
                    >
                      <Icon
                        name={it.icon ?? 'folder'}
                        size="sm"
                        strokeWidth={1.6}
                        className="text-fg-subtle"
                      />
                      <span className="flex-1 truncate">{it.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
