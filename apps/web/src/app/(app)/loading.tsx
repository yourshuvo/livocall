import { Icon } from '@/components/ui/icon'

export default function AppLoading() {
  return (
    <div className="flex h-screen flex-1 items-center justify-center bg-bg">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-bg-subtle px-4 py-3">
        <span className="grid size-8 animate-pulse place-items-center rounded-md bg-fg text-fg-inverse">
          <Icon name="phone" size="sm" />
        </span>
        <div>
          <p className="text-[13px] font-medium text-fg">Loading dashboard</p>
          <p className="text-[12px] text-fg-muted">Syncing workspace data…</p>
        </div>
      </div>
    </div>
  )
}
