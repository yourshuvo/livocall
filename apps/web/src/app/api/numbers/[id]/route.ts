export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { PhoneNumber } from '@/models/PhoneNumber'
import { Agent } from '@/models/Agent'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { phoneNumberToJson } from '@/lib/serialize'
import { encryptSipPassword, slugifySipProvider } from '@/lib/sip'

const Patch = z.object({
  agentId: z.string().nullable().optional(),
  providerName: z.string().trim().min(1).max(80).optional(),
  providerSlug: z.string().trim().max(64).optional(),
  didRange: z.string().max(120).optional(),
  sipServer: z.string().trim().min(1).max(255).optional(),
  sipPort: z.number().int().min(1).max(65535).optional(),
  sipProxy: z.string().trim().max(255).optional(),
  sipRealm: z.string().trim().max(255).optional(),
  sipUsername: z.string().trim().min(1).max(160).optional(),
  sipAuthUsername: z.string().trim().max(160).optional(),
  sipPassword: z.string().max(512).optional(),
  sipRegister: z.boolean().optional(),
  sipTransport: z.enum(['udp', 'tcp', 'tls']).optional(),
  sipCodecs: z.string().trim().max(120).optional(),
  inboundEnabled: z.boolean().optional(),
  outboundEnabled: z.boolean().optional(),
})

export const GET = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const num = await PhoneNumber.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!num) return apiError('not_found')
  return NextResponse.json(phoneNumberToJson(num))
})

export const PATCH = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  const body = Patch.parse(await req.json().catch(() => ({})))
  await connectMongo()
  if (body.agentId) {
    const agent = await Agent.findOne({ _id: body.agentId, orgId: s.orgId }).lean()
    if (!agent) return apiError('invalid_input', 'agent does not belong to this org')
  }
  const providerSlug =
    body.providerName || body.providerSlug
      ? slugifySipProvider(body.providerSlug || body.providerName || '')
      : undefined
  const updated = await PhoneNumber.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    {
      $set: {
        ...(body.providerName !== undefined ? { providerName: body.providerName } : {}),
        ...(providerSlug !== undefined ? { providerSlug } : {}),
        ...(body.didRange !== undefined ? { didRange: body.didRange } : {}),
        ...(body.sipServer !== undefined ? { sipServer: body.sipServer } : {}),
        ...(body.sipPort !== undefined ? { sipPort: body.sipPort } : {}),
        ...(body.sipProxy !== undefined ? { sipProxy: body.sipProxy } : {}),
        ...(body.sipRealm !== undefined ? { sipRealm: body.sipRealm } : {}),
        ...(body.sipUsername !== undefined ? { sipUsername: body.sipUsername } : {}),
        ...(body.sipAuthUsername !== undefined ? { sipAuthUsername: body.sipAuthUsername } : {}),
        ...(body.sipPassword !== undefined
          ? {
              sipPassword: encryptSipPassword(body.sipPassword),
              sipPasswordSet: Boolean(body.sipPassword),
            }
          : {}),
        ...(body.sipRegister !== undefined ? { sipRegister: body.sipRegister } : {}),
        ...(body.sipTransport !== undefined ? { sipTransport: body.sipTransport } : {}),
        ...(body.sipCodecs !== undefined ? { sipCodecs: body.sipCodecs } : {}),
        ...(body.inboundEnabled !== undefined ? { inboundEnabled: body.inboundEnabled } : {}),
        ...(body.outboundEnabled !== undefined ? { outboundEnabled: body.outboundEnabled } : {}),
        ...(body.agentId !== undefined
          ? body.agentId === null
            ? { agentId: null }
            : { agentId: body.agentId }
          : {}),
      },
    },
    { new: true },
  ).lean()
  if (!updated) return apiError('not_found')
  const auditMeta = { ...body, ...(body.sipPassword !== undefined ? { sipPassword: '[redacted]' } : {}) }
  await recordAudit(s, {
    action: 'number.update',
    resource: { type: 'PhoneNumber', id: String(updated._id) },
    meta: auditMeta,
  })
  return NextResponse.json(phoneNumberToJson(updated))
})

export const DELETE = withErrors(async (_req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const r = await PhoneNumber.deleteOne({ _id: oid, orgId: s.orgId })
  if (r.deletedCount === 0) return apiError('not_found')
  await recordAudit(s, {
    action: 'number.delete',
    resource: { type: 'PhoneNumber', id: String(oid) },
  })
  return NextResponse.json({ ok: true })
})
