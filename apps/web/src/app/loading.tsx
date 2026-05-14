import { Icon } from '@/components/ui/icon'

export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg">
      <div className="rounded-2xl border border-line bg-bg-subtle px-8 py-7 text-center shadow-sm">
        <div className="mx-auto grid size-12 animate-pulse place-items-center rounded-xl bg-fg text-fg-inverse">
          <Icon name="phone" size="md" />
        </div>
        <p className="mt-4 font-display text-[18px] font-semibold tracking-[-0.02em] text-fg">
          Loading LivoCall
        </p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Preparing your agents, calls, and workspace.
        </p>
        <div className="mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-bg-muted">
          <div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-fg" />
        </div>
      </div>
    </div>
  )
}
