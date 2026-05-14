'use client'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'

export function TopBar({
  title,
  searchPlaceholder,
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
      {searchPlaceholder && (
        <div className="hidden h-9 min-w-[240px] items-center gap-2 rounded-md border border-line bg-bg-subtle px-3 text-[12.5px] text-fg-faint lg:flex">
          <Icon name="search" size="xs" />
          <span>{searchPlaceholder}</span>
        </div>
      )}
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  )
}