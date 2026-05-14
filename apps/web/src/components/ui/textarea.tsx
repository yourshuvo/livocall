import * as React from 'react'
import { cn } from '@/lib/cn'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-[96px] w-full rounded border border-line bg-bg-subtle px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-fg/40 focus:outline-none focus:ring-2 focus:ring-accent/20',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
