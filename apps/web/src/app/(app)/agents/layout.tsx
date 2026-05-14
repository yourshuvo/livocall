'use client'
import { usePathname } from 'next/navigation'
import { SubNav, type SubNavGroup } from '@/components/app/sub-nav'

const AGENT_GROUPS: SubNavGroup[] = [
  {
    label: 'Folders',
    addable: true,
    items: [{ href: '/agents/templates', label: 'Template Agents', icon: 'folder' }],
  },
  {
    label: 'Transfer Agents',
    items: [
      {
        href: '/agents/transfer-screening',
        label: 'Transfer Screening Agents',
        icon: 'shield-check',
      },
    ],
  },
]

// Routes where the secondary "folders / transfer agents" rail makes sense.
// Detail and create flows render full-width to match the Retell editor layout.
const LIST_ROUTES = new Set<string>([
  '/agents',
  '/agents/templates',
  '/agents/transfer-screening',
])

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/agents'
  const showRail = LIST_ROUTES.has(pathname)
  return (
    <div className="flex h-screen">
      {showRail && <SubNav title="All Agents" rootHref="/agents" groups={AGENT_GROUPS} />}
      <div className="flex h-screen min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
