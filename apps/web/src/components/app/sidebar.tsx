'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'
import { BrandIcon, Wordmark } from '@/components/wordmark'
import { clerkSidebarUserButtonAppearance } from '@/lib/clerk-appearance'

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
    <>
      <MobileNav role={role} creditsPaisa={creditsPaisa} />
      <aside
        className={cn(
          'border-line bg-bg hidden h-dvh shrink-0 flex-col border-r transition-[width] md:flex',
          collapsed ? 'w-[64px]' : 'w-[248px]',
        )}
      >
        {/* Top: brand row */}
        <div className="flex h-16 items-center justify-between px-3">
          <Link href="/overview" className="text-fg flex min-w-0 items-center gap-2">
            {!collapsed ? (
              <Wordmark className="h-11 max-w-[196px]" />
            ) : (
              <BrandIcon className="size-10" />
            )}
          </Link>
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
            className="text-fg-faint hover:bg-bg-muted hover:text-fg grid size-6 place-items-center rounded-[4px] transition"
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

        {/* Balance warning */}
        {!collapsed && (
          <div className="px-2 pb-2">
            <BalanceWarningCard initialCreditsPaisa={creditsPaisa} />
          </div>
        )}

        {/* Account selector */}
        {!collapsed && (
          <div className="border-line border-t px-2 pb-2 pt-2">
            <AccountSelector email={email} />
          </div>
        )}
      </aside>
    </>
  )
}

function MobileNav({ role, creditsPaisa }: { role: string; creditsPaisa: number }) {
  const pathname = usePathname()
  const items = [
    { href: '/overview', icon: 'dashboard', label: 'Home' },
    { href: '/agents', icon: 'bot', label: 'Agents' },
    { href: '/calls', icon: 'phone-call', label: 'Calls' },
    ...(role === 'owner' || role === 'admin'
      ? [{ href: '/numbers', icon: 'hash', label: 'Numbers' }]
      : []),
    {
      href: creditsPaisa <= LOW_BALANCE_PAISA ? '/billing' : '/settings',
      icon: creditsPaisa <= LOW_BALANCE_PAISA ? 'wallet' : 'settings',
      label: creditsPaisa <= LOW_BALANCE_PAISA ? 'Balance' : 'More',
    },
  ] as NavItem[]
  const gridClass = items.length >= 5 ? 'grid-cols-5' : 'grid-cols-4'

  return (
    <nav className="border-line bg-bg/95 fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur md:hidden">
      <ul className={cn('grid gap-1', gridClass)}>
        {items.slice(0, 5).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md text-[10.5px] transition',
                  active
                    ? 'bg-bg-muted text-fg'
                    : 'text-fg-muted hover:bg-bg-muted/60 hover:text-fg',
                )}
              >
                <Icon name={item.icon} size="sm" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
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
        <p className="text-fg-faint px-2 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.08em]">
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
                    ? 'bg-bg-muted text-fg font-medium'
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
                  <span className="bg-bg-inset text-fg-muted rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium">
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const { toast } = useToast()
  const normalizedMemberships = useMemo(
    () => normalizeMemberships(memberships, { orgId, orgName, role }),
    [memberships, orgId, orgName, role],
  )

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

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

  const displayName = cleanWorkspaceName(orgName)
  const activeRole = formatRole(role)
  const workspaceCount = normalizedMemberships.length

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Switch workspace, current workspace ${displayName}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'border-line bg-bg-subtle/70 shadow-inner-line group flex w-full items-center gap-2 rounded-[6px] border px-2 py-2 text-left transition',
          open ? 'border-fg/25 bg-bg-muted/80' : 'hover:border-fg/20 hover:bg-bg-muted/70',
        )}
      >
        <span className="border-line bg-bg text-fg-muted group-hover:text-fg grid size-8 shrink-0 place-items-center rounded-[6px] border transition">
          <Icon name="building" size="sm" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-fg block truncate text-[12.5px] font-semibold leading-4">
            {displayName}
          </span>
          <span className="text-fg-faint mt-0.5 block truncate text-[10.5px]">
            Workspace - {activeRole}
          </span>
        </span>
        <Icon
          name="chevron-up-down"
          size="xs"
          className={cn(
            'text-fg-faint group-hover:text-fg-muted shrink-0 transition',
            open && 'text-fg-muted',
          )}
        />
      </button>
      {open && (
        <div className="border-line bg-bg shadow-pop absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[6px] border">
          <div className="border-line bg-bg-subtle/50 flex items-center justify-between border-b px-2.5 py-2">
            <span className="text-fg-muted text-[11px] font-medium">Workspaces</span>
            <span className="bg-bg text-fg-faint rounded-[3px] px-1.5 py-0.5 text-[10px]">
              {workspaceCount}
            </span>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {normalizedMemberships.map((m) => {
              const active = m.orgId === orgId
              return (
                <li key={m.orgId}>
                  <button
                    type="button"
                    disabled={switching}
                    onClick={() => onSwitch(m.orgId)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2 py-2 text-left text-[12.5px] transition disabled:cursor-wait disabled:opacity-60',
                      active ? 'bg-bg-muted text-fg' : 'text-fg hover:bg-bg-muted/60',
                    )}
                  >
                    <span className="border-line bg-bg text-fg-muted grid size-7 shrink-0 place-items-center rounded-[5px] border text-[10px] font-semibold">
                      {workspaceInitials(m.orgName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {cleanWorkspaceName(m.orgName)}
                      </span>
                      <span className="text-fg-faint block truncate text-[10.5px]">
                        {formatRole(m.role)}
                      </span>
                    </span>
                    {active && <Icon name="check" size="xs" className="text-fg shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function normalizeMemberships(memberships: WorkspaceSummary[], current: WorkspaceSummary) {
  const byId = new Map<string, WorkspaceSummary>()
  for (const membership of [current, ...memberships]) {
    if (!membership.orgId) continue
    byId.set(membership.orgId, {
      ...membership,
      orgName: membership.orgName || 'Workspace',
      role: membership.role || 'agent',
    })
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.orgId === current.orgId) return -1
    if (b.orgId === current.orgId) return 1
    return cleanWorkspaceName(a.orgName).localeCompare(cleanWorkspaceName(b.orgName))
  })
}

function cleanWorkspaceName(name: string) {
  return name.trim() || 'Workspace'
}

function workspaceInitials(name: string) {
  const cleaned = cleanWorkspaceName(name)
  const words = cleaned.split(/\s+/).filter(Boolean)
  const initials =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : cleaned.slice(0, 2)
  return initials.toUpperCase()
}

function formatRole(role: string) {
  return (
    role
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(' ') || 'Member'
  )
}

const LOW_BALANCE_PAISA = 10_000

function BalanceWarningCard({ initialCreditsPaisa }: { initialCreditsPaisa: number }) {
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
  if (credits > LOW_BALANCE_PAISA) return null
  return (
    <div className="border-status-warn/35 bg-status-warn-soft/60 rounded-[6px] border p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-fg inline-flex items-center gap-1.5 text-[11px] font-semibold">
          <Icon name="wallet" size="xs" className="text-status-warn" />
          Low balance
        </span>
      </div>
      <dl className="space-y-0.5 text-[11px] leading-tight">
        <div className="text-fg-muted flex items-center justify-between">
          <dt>Balance:</dt>
          <dd className="text-fg font-medium">{bdt}</dd>
        </div>
      </dl>
      <Link
        href="/billing"
        className="bg-fg text-fg-inverse hover:bg-fg-strong mt-2 inline-flex w-full items-center justify-center gap-1 rounded-[5px] px-2 py-1.5 text-[11.5px] font-medium transition"
      >
        <Icon name="arrow-up-right" size="xs" />
        Top up balance
      </Link>
    </div>
  )
}

function AccountSelector({ email }: { email: string }) {
  const display = email || 'account@livocall.com'
  return (
    <div className="border-line bg-bg-subtle/60 shadow-inner-line rounded-[6px] border p-1">
      <UserButton
        showName
        afterSwitchSessionUrl="/overview"
        userProfileMode="modal"
        appearance={clerkSidebarUserButtonAppearance}
        fallback={<AccountFallback display={display} />}
      />
    </div>
  )
}

function AccountFallback({ display }: { display: string }) {
  return (
    <div className="flex h-9 w-full items-center gap-2 rounded-[5px] px-2">
      <span className="bg-line size-6 shrink-0 rounded-full" />
      <span className="text-fg min-w-0 flex-1 truncate text-[12px] font-medium">{display}</span>
    </div>
  )
}
