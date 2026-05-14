'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'

export function AgentActions({
  agentId,
  status,
}: {
  agentId: string
  status: 'draft' | 'live'
}) {
  const router = useRouter()
  const [testOpen, setTestOpen] = useState(false)
  const [toE164, setToE164] = useState('')
  const [pending, start] = useTransition()
  const { toast } = useToast()

  function toggleStatus() {
    start(async () => {
      try {
        await api.patch(`/api/agents/${agentId}`, {
          status: status === 'live' ? 'draft' : 'live',
        })
        toast(status === 'live' ? 'Agent moved to draft' : 'Agent is live', 'success')
        router.refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function runTestCall() {
    if (!/^\+\d{8,15}$/.test(toE164)) {
      toast('Enter a valid E.164 number (e.g. +8801711000000)', 'error')
      return
    }
    start(async () => {
      try {
        await api.post(`/api/agents/${agentId}/test-call`, { toE164 })
        toast('Test call originated — watch the call log', 'success')
        setTestOpen(false)
        setToE164('')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function remove() {
    if (!confirm('Delete this agent? This cannot be undone.')) return
    start(async () => {
      try {
        await api.del(`/api/agents/${agentId}`)
        toast('Agent deleted', 'success')
        router.push('/agents')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href="/agents">
          <Icon name="arrow-right" size="xs" className="rotate-180" /> All agents
        </Link>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setTestOpen(true)}
      >
        <Icon name="phone-out" size="sm" /> Test call
      </Button>
      <Button asChild size="sm" className="gap-1.5">
        <Link href={`/agents/${agentId}/edit`}>
          <Icon name="settings" size="sm" /> Edit
        </Link>
      </Button>
      <Button variant="ghost" size="sm" onClick={toggleStatus} disabled={pending}>
        {status === 'live' ? 'Move to draft' : 'Go live'}
      </Button>
      <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
        Delete
      </Button>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test this agent</DialogTitle>
            <p className="text-[12.5px] text-fg-muted">
              We’ll originate a real call to the number you provide. Make sure the destination is
              expecting the call.
            </p>
          </DialogHeader>
          <div>
            <Label>Destination (E.164)</Label>
            <Input
              className="mt-2"
              placeholder="+8801711000000"
              value={toE164}
              onChange={(e) => setToE164(e.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" onClick={runTestCall} disabled={pending || !toE164}>
              Place call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
