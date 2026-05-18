import { Icon } from '@/components/ui/icon'

export default function AppLoading() {
  return (
    <div className="flex h-screen flex-1 items-center justify-center bg-bg">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-bg-subtle px-4 py-3">
        <span className="grid size-8 animate-pulse place-items-center rounded-md bg-fg text-fg-inverse">
          <img
            src="https://res.cloudinary.com/dfb3ym0jr/image/upload/v1779084797/file_0000000019fc72079de24940c9d76d56_lki6kr.png"
            alt="Loading"
            className="size-5 object-contain"
          />
        </span>
        <div>
          <p className="text-[13px] font-medium text-fg">Loading dashboard</p>
          <p className="text-[12px] text-fg-muted">Syncing workspace data…</p>
        </div>
      </div>
    </div>
  )
}
