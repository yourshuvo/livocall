export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Org } from '@/models/Org'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { orgToJson } from '@/lib/serialize'
import { updateClerkOrganizationName } from '@/lib/clerk-orgs'

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  btrcDisclosure: z.string().max(2000).optional(),
  btrcDisclosureAudioUrl: z.string().url().max(512).optional().or(z.literal('')),
  recordingConsent: z.enum(['required', 'optional', 'disabled']).optional(),
  plan: z.enum(['starter', 'growth', 'scale']).optional(),
  dailySpendCapPaisa: z.number().int().min(0).max(10_000_00_00).optional(),
  monthlySpendCapPaisa: z.number().int().min(0).max(100_000_00_00).optional(),
  compliance: z
    .object({
      piiRedaction: z.boolean().optional(),
      detectOptOutSpeech: z.boolean().optional(),
      retentionDays: z.number().int().min(1).max(3650).optional(),
      auditLogRetentionDays: z.number().int().min(1).max(3650).optional(),
      agentRoleCanExport: z.boolean().optional(),
    })
    .optional(),
})

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const org = await Org.findById(s.orgId).lean()
  if (!org) return apiError('not_found')
  return NextResponse.json(orgToJson(org))
})

export const PATCH = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const body = Patch.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const org = await Org.findByIdAndUpdate(s.orgId, { $set: body }, { new: true }).lean()
  if (!org) return apiError('not_found')
  if (body.name !== undefined) {
    await updateClerkOrganizationName(org)
  }
  await recordAudit(s, {
    action: 'org.update',
    resource: { type: 'Org', id: String(org._id) },
    meta: body,
  })
  return NextResponse.json(orgToJson(org))
})
