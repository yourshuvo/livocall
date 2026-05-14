import { headers } from 'next/headers'
import { connectMongo } from '@/lib/db'
import { AuditLog } from '@/models/AuditLog'
import type { DashboardSession } from '@/lib/api-helpers'

export interface AuditInput {
  action: string
  resource?: { type?: string; id?: string | null }
  meta?: Record<string, unknown>
}

/**
 * Record an audit-log entry. Best-effort: never throws.
 * Call this inside mutation routes after the write succeeded.
 */
export async function recordAudit(
  session: DashboardSession,
  entry: AuditInput,
): Promise<void> {
  try {
    const h = headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      undefined
    const userAgent = h.get('user-agent') || undefined
    await connectMongo()
    await AuditLog.create({
      orgId: session.orgId,
      actorId: session.userId,
      actorEmail: session.email,
      action: entry.action,
      resource: entry.resource
        ? { type: entry.resource.type, id: entry.resource.id ?? undefined }
        : undefined,
      meta: entry.meta ?? {},
      ip,
      userAgent,
    })
  } catch {
    // audit never breaks the request
  }
}
