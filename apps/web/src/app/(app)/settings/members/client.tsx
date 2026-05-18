'use client'
import { useEffect, useState, useTransition } from 'react'
import { Card, CardBody, CardDescription, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'

type Role = 'owner' | 'admin' | 'agent'

interface Member {
  id: string
  userId: string
  email: string
  name: string | null
  role: Role
  invitedBy: string | null
  acceptedAt: string | null
  createdAt: string | null
  lastLoginAt: string | null
}

interface PendingInvite {
  id: string
  email: string
  role: Role
  invitedBy: string | null
  createdAt: string | null
  expiresAt: string | null
}

interface MembersPayload {
  members: Member[]
  pending: PendingInvite[]
}

const ROLES: Role[] = ['owner', 'admin', 'agent']

export function MembersClient({
  canAdmin,
  currentUserId,
}: {
  canAdmin: boolean
  currentUserId: string
}) {
  const [data, setData] = useState<MembersPayload>({ members: [], pending: [] })
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('agent')
  const [pending, start] = useTransition()
  const { toast } = useToast()

  async function refresh() {
    try {
      const j = await api.get<MembersPayload>('/api/settings/members')
      setData(j)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const j = await api.get<MembersPayload>('/api/settings/members')
        if (!cancelled) setData(j)
      } catch (e) {
        if (!cancelled) toast((e as Error).message, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [toast])

  function invite(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      try {
        await api.post('/api/settings/members', { email: inviteEmail, role: inviteRole })
        toast('Invite sent', 'success')
        setInviteEmail('')
        setInviteRole('agent')
        await refresh()
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    })
  }

  function updateRole(m: Member, role: Role) {
    if (role === m.role) return
    start(async () => {
      try {
        await api.patch(`/api/settings/members/${m.id}`, { role })
        toast('Role updated', 'success')
        await refresh()
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    })
  }

  function removeMember(m: Member) {
    if (!confirm(`Remove ${m.email} from this workspace?`)) return
    start(async () => {
      try {
        await api.del(`/api/settings/members/${m.id}`)
        toast('Member removed', 'success')
        await refresh()
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    })
  }

  function revokeInvite(i: PendingInvite) {
    if (!confirm(`Revoke pending invite to ${i.email}?`)) return
    start(async () => {
      try {
        await api.del(`/api/settings/invites/${i.id}`)
        toast('Invite revoked', 'success')
        await refresh()
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    })
  }

  return (
    <div className="space-y-8">
      {canAdmin && (
        <Card>
          <div className="border-b border-line p-5">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
                <Icon name="plus" size="sm" />
              </span>
              <CardTitle>Invite member</CardTitle>
            </div>
            <CardDescription>
              We&rsquo;ll email the invite link. It&rsquo;s good for 7 days or until you revoke it.
            </CardDescription>
          </div>
          <CardBody>
            <form onSubmit={invite} className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
              <div>
                <Label htmlFor="inv-email">Email</Label>
                <Input
                  id="inv-email"
                  type="email"
                  required
                  className="mt-2"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="inv-role">Role</Label>
                <select
                  id="inv-role"
                  className="mt-2 h-10 w-full rounded-md border border-line bg-bg px-2 text-[13px]"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:pt-6">
                <Button type="submit" disabled={pending} className="h-10 w-full md:w-auto">
                  Send invite
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="border-b border-line p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
              <Icon name="headset" size="sm" />
            </span>
            <CardTitle>Members</CardTitle>
          </div>
          <CardDescription>
            {data.members.length} active {data.members.length === 1 ? 'member' : 'members'}.
          </CardDescription>
        </div>
        <CardBody className="p-0">
          <table className="w-full text-[13px]">
            <thead className="bg-bg-subtle/50 text-fg-muted">
              <tr>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                  Name / email
                </th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                  Role
                </th>
                <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                  Last seen
                </th>
                <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">
                  {canAdmin ? 'Actions' : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-fg-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data.members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-fg-muted">
                    No members yet.
                  </td>
                </tr>
              )}
              {data.members.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <div className="font-medium text-fg">{m.name || m.email}</div>
                    {m.name && <div className="text-fg-muted">{m.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {canAdmin && m.userId !== currentUserId ? (
                      <select
                        className="h-8 rounded-md border border-line bg-bg px-2 text-[12px]"
                        value={m.role}
                        onChange={(e) => updateRole(m, e.target.value as Role)}
                        disabled={pending}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge>{m.role}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-fg-muted">
                    {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canAdmin && m.userId !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMember(m)}
                        disabled={pending}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {data.pending.length > 0 && (
        <Card>
          <div className="border-b border-line p-5">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
                <Icon name="clock" size="sm" />
              </span>
              <CardTitle>Pending invites</CardTitle>
            </div>
            <CardDescription>
              These invites haven&rsquo;t been accepted yet. Resending an invite revokes the old one.
            </CardDescription>
          </div>
          <CardBody className="p-0">
            <table className="w-full text-[13px]">
              <thead className="bg-bg-subtle/50 text-fg-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                    Email
                  </th>
                  <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                    Role
                  </th>
                  <th className="px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">
                    Expires
                  </th>
                  <th className="px-4 py-2 text-right font-mono text-[11px] uppercase tracking-[0.14em]">
                    {canAdmin ? 'Actions' : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.pending.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-4 py-3 text-fg">{i.email}</td>
                    <td className="px-4 py-3">
                      <Badge>{i.role}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-fg-muted">
                      {i.expiresAt ? new Date(i.expiresAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeInvite(i)}
                          disabled={pending}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
