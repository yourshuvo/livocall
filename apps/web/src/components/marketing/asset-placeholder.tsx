import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

export function AssetPlaceholder({
  label,
  caption,
  icon = 'upload',
  className,
  dark = false,
  compact = false,
}: {
  label: string
  caption: string
  icon?: IconName
  className?: string
  dark?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border',
        compact ? 'p-3' : 'p-5',
        dark ? 'border-white/12 bg-white/[0.06] text-white' : 'border-line bg-bg-subtle text-fg',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,transparent_46%,currentColor_47%,transparent_48%,transparent_100%)] opacity-[0.05]',
          dark ? 'text-white' : 'text-fg',
        )}
      />
      <div className={cn('relative flex items-start', compact ? 'gap-3' : 'gap-4')}>
        <Icon
          name={icon}
          size={compact ? 'md' : 'xl'}
          square
          className={cn(dark && 'border-white/15 bg-white/10 text-white/70')}
        />
        <div>
          <p className={cn('font-display font-medium tracking-tighter', compact ? 'text-[14px]' : 'text-[18px]')}>
            {label}
          </p>
          <p
            className={cn(
              'mt-1 max-w-xs leading-relaxed',
              compact ? 'text-[11px]' : 'text-[12px]',
              dark ? 'text-white/55' : 'text-fg-muted',
            )}
          >
            {caption}
          </p>
        </div>
      </div>
    </div>
  )
}
