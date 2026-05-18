'use client'
import type { ReactNode } from 'react'
export function TopBar({
  title,
  actions,
}: {
  title: string
  searchPlaceholder?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex min-h-[64px] items-center gap-4 border-b border-line/70 bg-bg/95 px-6 backdrop-blur">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
          LivoCall
        </p>
        <h1 className="truncate font-display text-[20px] font-semibold tracking-tight text-fg">
          {title}
        </h1>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  )
}
