import { cn } from '@/lib/cn'

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline font-display text-[18px] font-semibold tracking-[-0.02em] text-fg',
        className,
      )}
    >
      livocall
    </span>
  )
}
