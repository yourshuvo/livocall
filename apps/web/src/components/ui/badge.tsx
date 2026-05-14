import * as React from 'react'
import { cn } from '@/lib/cn'

type Variant = 'default' | 'accent' | 'live' | 'warn' | 'fail' | 'outline'

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    default: 'bg-bg-muted text-fg-muted',
    accent: 'bg-bg-muted text-fg',
    live: 'bg-status-live/10 text-status-live',
    warn: 'bg-status-warn/10 text-status-warn',
    fail: 'bg-status-fail/10 text-status-fail',
    outline: 'ring-1 ring-line text-fg-muted',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium tracking-tighter',
        styles[variant],
        className,
      )}
      {...props}
    />
  )
}
