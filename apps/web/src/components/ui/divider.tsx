import { cn } from '@/lib/cn'

export function Rule({ className }: { className?: string }) {
  return <hr className={cn('border-t border-line', className)} />
}

export function HairRule({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />
}
