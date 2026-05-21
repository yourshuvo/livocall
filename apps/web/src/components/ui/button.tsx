'use client'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-blue-600 text-white hover:bg-blue-700',
        secondary:
          'bg-bg-subtle text-fg ring-1 ring-line hover:ring-fg/30 hover:bg-bg-muted',
        ghost: 'text-fg hover:bg-bg-muted',
        link: 'text-fg underline-offset-4 hover:underline px-0',
        danger: 'bg-status-fail text-fg-inverse hover:bg-status-fail/90',
        invert: 'bg-paper text-fg hover:bg-white/90',
        'ghost-light':
          'bg-white/10 text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/15 hover:ring-white/50',
      },
      size: {
        sm: 'h-8 rounded px-3 text-sm',
        md: 'h-10 rounded px-4 text-sm',
        lg: 'h-11 rounded-md px-5 text-[15px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { buttonVariants }
