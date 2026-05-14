'use client'
import { useEffect, useState } from 'react'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'

export interface WorkspaceSummary {
  orgId: string
  orgName: string
  role: string
}

interface NavItem {
  href: string
  icon: IconName
  label: string
  /** Restrict visibility to these roles. */
  roles?: string[]
  /** Optional badge/count rendered on the right. */
  badge?: string
}

interface NavSection {
  label: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    label: 'Build',
    items: [
      { href: '/agents', icon: 'bot', label: 'Agents' },
      { href: '/knowledge', icon: 'book', label: 'Knowledge Base' },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { href: '/numbers', icon: 'hash', label: 'Phone Numbers', roles: ['owner', 'admin'] },
      { href: '/campaigns', icon: 'megaphone', label: 'Batch Call', roles: ['owner', 'admin'] },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { href: '/calls', icon: 'phone-call', label: 'Call History' },
      { href: '/monitoring', icon: 'headset', label: 'Live Monitoring' },
      { href: '/analytics', icon: 'bar-chart', label: 'Analytics' },
      { href: '/dnc', icon: 'shield-check', label: 'AI Quality Assurance' },
      { href: '/connections', icon: 'plug', label: 'Connections', roles: ['owner', 'admin'] },
      { href: '/developers', icon: 'code', label: 'Developers', roles: ['owner', 'admin'] },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/billing', icon: 'wallet', label: 'Billing', roles: ['owner', 'admin'] },
      { href: '/settings', icon: 'settings', label: 'Settings', roles: ['owner', 'admin'] },
    ],
  },
]

export function Sidebar({
  orgName,
  orgId,
  email,
  role,
  creditsPaisa,
  memberships,
}: {
  orgName: string
  orgId: string
  email: string
  role: string
  creditsPaisa: number
  memberships: WorkspaceSummary[]
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col border-r border-line bg-bg transition-[width]',
        collapsed ? 'w-[56px]' : 'w-[220px]',
      )}
    >
      {/* Top: brand row */}
      <div className="flex h-12 items-center justify-between px-3">
        <Link href="/overview" className="flex items-center gap-2 text-fg">
          <span
            aria-hidden
            className="grid size-5 place-items-center rounded-[4px] bg-fg text-fg-inverse"
          >
            <Icon name="phone" size="xs" strokeWidth={2.2} />
          </span>
          <span className="font-display text-[14.5px] font-semibold tracking-[-0.015em]">
            {!collapsed && 'livocall'}
          </span>
        </Link>
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
          className="grid size-6 place-items-center rounded-[4px] text-fg-faint transition hover:bg-bg-muted hover:text-fg"
        >
          <Icon name="panel-left" size="sm" />
        </button>
      </div>

      {/* Workspace switcher */}
      {!collapsed && (
      <div className="px-2 pb-2">
        <WorkspaceSwitcher
          orgName={orgName}
          orgId={orgId}
          memberships={memberships}
          role={role}
        />
      </div>
      )}

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {SECTIONS.map((section) => (
          <NavGroup
            key={section.label}
            section={section}
            pathname={pathname}
            role={role}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Free trial card */}
      {!collapsed && (
      <div className="px-2 pb-2">
        <FreeTrialCard initialCreditsPaisa={creditsPaisa} />
      </div>
      )}

      {/* Account selector */}
      {!collapsed && (
      <div className="border-t border-line px-2 pt-2">
        <AccountSelector email={email} />
        <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5 pb-2 pt-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-[11.5px] text-fg-muted transition hover:bg-bg-muted hover:text-fg"
          >
            <Icon name="help" size="xs" />
            Help
          </button>
          <span aria-hidden className="text-[10px] text-fg-faint">
            ·
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-[11.5px] text-fg-muted transition hover:bg-bg-muted hover:text-fg"
          >
            <Icon name="zap" size="xs" />
            Updates
          </button>
          <span aria-hidden className="text-[10px] text-fg-faint">
            ·
          </span>
        </div>
      </div>
      )}
    </aside>
  )
}

function NavGroup({
  section,
  pathname,
  role,
  collapsed,
}: {
  section: NavSection
  pathname: string
  role: string
  collapsed: boolean
}) {
  const items = section.items.filter((it) => !it.roles || it.roles.includes(role))
  if (items.length === 0) return null
  return (
    <div className="mb-3">
      {!collapsed && (
      <p className="px-2 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
        {section.label}
      </p>
      )}
      <ul className="space-y-px">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + '/')
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  'group flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-[13px] transition-colors',
                  collapsed && 'justify-center',
                  active
                    ? 'bg-bg-muted font-medium text-fg'
                    : 'text-fg-muted hover:bg-bg-muted/60 hover:text-fg',
                )}
                title={collapsed ? it.label : undefined}
              >
                <Icon
                  name={it.icon}
                  size="sm"
                  strokeWidth={1.6}
                  className={cn(active ? 'text-fg' : 'text-fg-subtle')}
                />
                {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
                {!collapsed && it.badge && (
                  <span className="rounded-[3px] bg-bg-inset px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
                    {it.badge}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function WorkspaceSwitcher({
  orgName,
  orgId,
  memberships,
  role,
}: {
  orgName: string
  orgId: string
  memberships: WorkspaceSummary[]
  role: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const { toast } = useToast()

  async function onSwitch(targetId: string) {
    if (targetId === orgId) {
      setOpen(false)
      return
    }
    setSwitching(true)
    try {
      await api.post('/api/auth/switch-org', { orgId: targetId })
      toast('Switched workspace', 'success')
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSwitching(false)
    }
  }

  const initials = orgName.slice(0, 1).toUpperCase()
  const truncated = orgName.length > 14 ? `${orgName.slice(0, 14)}…` : orgName

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Switch workspace"
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-2 rounded-[6px] px-1.5 py-1.5 text-left transition hover:bg-bg-muted"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-gradient-to-br from-sky-400 to-sky-600 text-[10px] font-semibold leading-none text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-fg">
            {truncated} Workspace
          </span>
          <span className="block truncate text-[10.5px] uppercase tracking-[0.06em] text-fg-faint">
            {role}
          </span>
        </span>
        <Icon
          name="chevron-up-down"
          size="xs"
          className="shrink-0 text-fg-faint transition group-hover:text-fg-muted"
        />
      </button>
      {open && memberships.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[6px] border border-line bg-bg shadow-pop">
          <ul className="max-h-64 overflow-y-auto py-1">
            {memberships.map((m) => (
              <li key={m.orgId}>
                <button
                  type="button"
                  disabled={switching}
                  onClick={() => onSwitch(m.orgId)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12.5px]',
                    m.orgId === orgId ? 'bg-bg-muted text-fg' : 'text-fg hover:bg-bg-muted/60',
                  )}
                >
                  <span className="grid size-6 place-items-center rounded-[5px] bg-gradient-to-br from-sky-400 to-sky-600 text-[10px] font-semibold text-white">
                    {m.orgName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.orgName}</span>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                    {m.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function FreeTrialCard({ initialCreditsPaisa }: { initialCreditsPaisa: number }) {
  const [credits, setCredits] = useState(initialCreditsPaisa)
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const res = await fetch('/api/billing/usage?days=1', { cache: 'no-store' })
        const json = await res.json()
        if (!cancelled && typeof json.creditsPaisa === 'number') setCredits(json.creditsPaisa)
      } catch {
        /* ignore */
      }
    }
    void refresh()
    const t = window.setInterval(refresh, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])
  const bdt = new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(credits / 100)
  return (
    <div className="rounded-[6px] border border-line bg-bg-subtle/60 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg">
          <Icon name="sparkles" size="xs" className="text-sky-500" />
          Free Trial
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          className="grid size-4 place-items-center rounded-sm text-fg-faint transition hover:bg-bg-muted hover:text-fg"
        >
          <Icon name="x" size="xs" />
        </button>
      </div>
      <dl className="space-y-0.5 text-[11px] leading-tight">
        <div className="flex items-center justify-between text-fg-muted">
          <dt>Remaining:</dt>
          <dd className="font-medium text-fg">{bdt}</dd>
        </div>
        <div className="flex items-center justify-between text-fg-muted">
          <dt className="inline-flex items-center gap-1">
            Concurrency Used:
            <span className="grid size-3 place-items-center rounded-full bg-bg-muted text-[8px] text-fg-faint">
              ?
            </span>
          </dt>
          <dd className="font-medium text-fg">0/20</dd>
        </div>
      </dl>
      <Link
        href="/billing"
        className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-[5px] bg-fg px-2 py-1.5 text-[11.5px] font-medium text-fg-inverse transition hover:bg-fg-strong"
      >
        <Icon name="arrow-up-right" size="xs" />
        Add Payment
      </Link>
    </div>
  )
}

function AccountSelector({ email }: { email: string }) {
  const display = email || 'account@livocall.com'
  return (
    <div
      className="group flex w-full items-center gap-2 rounded-[5px] border border-line bg-bg px-2 py-1.5 text-left transition hover:bg-bg-muted"
    >
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[10px] font-semibold text-white">
        {display.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{display}</span>
      <UserButton />
      <Icon name="chevron-up-down" size="xs" className="shrink-0 text-fg-faint" />
    </div>
  )
}
