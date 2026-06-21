export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { PhoneNumber } from '@/models/PhoneNumber'
import { Agent } from '@/models/Agent'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { normalizeBdPhoneToE164, isE164 } from '@/lib/phone-number'
import { phoneNumberToJson } from '@/lib/serialize'
import { encryptSipPassword, slugifySipProvider } from '@/lib/sip'
import { AutoCallbackConfigSchema } from '@/lib/auto-callback'
import { triggerTelephonySync } from '@/lib/telephony-sync'

const Body = z.object({
  e164: z.string().trim().min(1).max(32),
  providerName: z.string().trim().min(1).max(80),
  providerSlug: z.string().trim().max(64).optional(),
  didRange: z.string().max(120).optional().default(''),
  sipServer: z.string().trim().min(1).max(255),
  sipPort: z.number().int().min(1).max(65535).default(5060),
  sipProxy: z.string().trim().max(255).optional().default(''),
  sipRealm: z.string().trim().max(255).optional().default(''),
  sipUsername: z.string().trim().min(1).max(160),
  sipAuthUsername: z.string().trim().max(160).optional().default(''),
  sipPassword: z.string().max(512).optional().default(''),
  sipRegister: z.boolean().optional().default(true),
  sipTransport: z.enum(['udp', 'tcp', 'tls']).optional().default('udp'),
  sipCodecs: z.string().trim().max(120).optional().default('PCMU@20ms'),
  agentId: z.string().optional(),
  inboundEnabled: z.boolean().optional().default(true),
  outboundEnabled: z.boolean().optional().default(true),
  autoCallback: AutoCallbackConfigSchema,
})

export const GET = withErrors(async () => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  await connectMongo()
  const numbers = await PhoneNumber.find({ orgId: s.orgId }).sort({ createdAt: -1 }).lean()
  return NextResponse.json({ numbers: numbers.map(phoneNumberToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  if (body.agentId) {
    const agent = await Agent.findOne({ _id: body.agentId, orgId: s.orgId }).lean()
    if (!agent) return apiError('invalid_input', 'agent does not belong to this org')
  }
  const providerSlug = slugifySipProvider(body.providerSlug || body.providerName)
  const e164 = normalizeBdPhoneToE164(body.e164 || body.sipUsername)
  if (!isE164(e164)) {
    return apiError('invalid_input', 'number must be E.164 or a BD local number like 096XXXXXXXX')
  }
  const exists = await PhoneNumber.findOne({ e164 }).lean()
  if (exists) return apiError('conflict', 'number already provisioned')
  const created = await PhoneNumber.create({
    orgId: s.orgId,
    ...body,
    e164,
    providerSlug,
    sipPassword: encryptSipPassword(body.sipPassword),
    sipPasswordSet: Boolean(body.sipPassword),
  })
  await recordAudit(s, {
    action: 'number.create',
    resource: { type: 'PhoneNumber', id: String(created._id) },
    meta: { e164: body.e164, providerSlug, sipServer: body.sipServer },
  })
  await triggerTelephonySync('number.create', String(created._id))
  return NextResponse.json(phoneNumberToJson(created.toObject()))
})
