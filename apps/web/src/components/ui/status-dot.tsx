import { cn } from '@/lib/cn'

export function StatusDot({
  status = 'default',
  tone,
  className,
}: {
  status?: 'live' | 'warn' | 'fail' | 'default' | string
  tone?: 'live' | 'warn' | 'fail' | 'default' | string
  className?: string
}) {
  const value = tone || status
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full',
        value === 'live' && 'bg-status-live',
        value === 'warn' && 'bg-status-warn',
        value === 'fail' && 'bg-status-fail',
        (!value || value === 'default') && 'bg-fg-faint',
        className,
      )}
    />
  )
}