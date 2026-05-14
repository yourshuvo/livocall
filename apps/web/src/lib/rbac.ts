import { apiError } from '@/lib/errors'
import type { DashboardSession } from '@/lib/api-helpers'

export type Role = 'owner' | 'admin' | 'agent'

const ORDER: Record<Role, number> = {
  agent: 1,
  admin: 2,
  owner: 3,
}

export function hasRole(session: Pick<DashboardSession, 'role'>, min: Role): boolean {
  const r = (session.role || 'agent') as Role
  return (ORDER[r] ?? 0) >= ORDER[min]
}

/**
 * Guard a mutation by role. Returns a 403 Response if the session lacks the
 * required role, else returns null so the caller can continue.
 */
export function requireRole(
  session: Pick<DashboardSession, 'role'>,
  min: Role,
): Response | null {
  if (!hasRole(session, min)) {
    return apiError('forbidden', `requires ${min} role`)
  }
  return null
}
