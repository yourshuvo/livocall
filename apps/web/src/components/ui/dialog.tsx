'use client'
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/ui/icon'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-bg p-5 shadow-float focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded p-1 text-fg-muted transition hover:bg-bg-muted hover:text-fg">
          <Icon name="x" size="xs" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('mb-4 space-y-1 pr-8', props.className)} />
}

export function DialogTitle({
  className,
  ...props
}: DialogPrimitive.DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-[18px] font-medium tracking-tighter text-fg', className)}
      {...props}
    />
  )
}

export function DialogFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('mt-5 flex justify-end gap-2 border-t border-line pt-4', props.className)}
    />
  )
}

export function DialogCloseButton({
  asChild,
  children,
}: {
  asChild?: boolean
  children: React.ReactNode
}) {
  const Comp = asChild ? Slot : DialogPrimitive.Close
  return <Comp>{children}</Comp>
}