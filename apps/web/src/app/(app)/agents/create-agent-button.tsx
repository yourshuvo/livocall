'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api-fetch'
import { cn } from '@/lib/cn'
import { DEFAULT_AGENT_PAYLOAD } from '@/lib/new-agent-defaults'

interface CreateAgentButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> {
  pendingChildren?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'primary' | 'secondary' | 'ghost' | 'link' | 'danger' | 'invert' | 'ghost-light'
}

export function CreateAgentButton({
  children = 'Create agent',
  pendingChildren = 'Creating...',
  className,
  disabled,
  size = 'sm',
  variant = 'primary',
  ...props
}: CreateAgentButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)

  async function createAgent() {
    if (pending) return
    setPending(true)
    try {
      const created = await api.post<{ id: string }>('/api/agents', DEFAULT_AGENT_PAYLOAD)
      router.push(`/agents/${created.id}`)
      router.refresh()
    } catch (error) {
      toast((error as Error).message || 'Could not create agent', 'error')
      setPending(false)
    }
  }

  return (
    <button
      {...props}
      type="button"
      disabled={disabled || pending}
      onClick={createAgent}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {pending ? pendingChildren : children}
    </button>
  )
}
