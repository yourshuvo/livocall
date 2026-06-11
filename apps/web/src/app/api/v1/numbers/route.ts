export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { PhoneNumber } from '@/models/PhoneNumber'
import { Agent } from '@/models/Agent'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'
import { normalizeBdPhoneToE164, isE164 } from '@/lib/phone-number'
import { phoneNumberToJson } from '@/lib/serialize'
import { encryptSipPassword, slugifySipProvider } from '@/lib/sip'
import { AutoCallbackConfigSchema } from '@/lib/auto-callback'
import { triggerFreeswitchSync } from '@/lib/freeswitch-sync'

const Body = z.object({
  e164: z.string().trim().min(1).max(32).optional(),
  providerName: z.string().trim().max(80).optional().default(''),
  providerSlug: z.string().trim().max(64).optional(),
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
  inboundEnabled: z.boolean().optional(),
  outboundEnabled: z.boolean().optional(),
  agentId: z.string().optional().nullable(),
  autoCallback: AutoCallbackConfigSchema,
})

export const GET = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'numbers:read')
  if (isResponse(auth)) return auth
  await connectMongo()
  const rows = await PhoneNumber.find({ orgId: auth.orgId }).sort({ createdAt: -1 }).lean()
  return NextResponse.json({ data: rows.map(phoneNumberToJson) })
})

export const POST = withErrors(async (req: Request) => {
  const auth = await authV1(req, 'numbers:write')
  if (isResponse(auth)) return auth
  const body = Body.parse(await req.json().catch(() => ({})))
  const e164 = normalizeBdPhoneToE164(body.e164 || body.sipUsername)
  if (!isE164(e164)) {
    return apiError('invalid_input', 'send e164 or a BD local SIP username like 096XXXXXXXX')
  }
  await connectMongo()
  if (body.agentId) {
    const agent = await Agent.findOne({ _id: body.agentId, orgId: auth.orgId }).lean()
    if (!agent) return apiError('invalid_input', 'agent does not belong to this org')
  }
  const exists = await PhoneNumber.findOne({ orgId: auth.orgId, e164 })
  if (exists) return apiError('conflict', 'number already connected')
  const providerSlug = slugifySipProvider(body.providerSlug || body.providerName)
  const created = await PhoneNumber.create({
    orgId: auth.orgId,
    e164,
    providerName: body.providerName || body.sipServer,
    providerSlug,
    sipServer: body.sipServer,
    sipPort: body.sipPort,
    sipProxy: body.sipProxy,
    sipRealm: body.sipRealm,
    sipUsername: body.sipUsername,
    sipAuthUsername: body.sipAuthUsername,
    sipPassword: encryptSipPassword(body.sipPassword),
    sipPasswordSet: Boolean(body.sipPassword),
    sipRegister: body.sipRegister,
    sipTransport: body.sipTransport,
    sipCodecs: body.sipCodecs,
    inboundEnabled: body.inboundEnabled ?? true,
    outboundEnabled: body.outboundEnabled ?? true,
    agentId: body.agentId || null,
    autoCallback: body.autoCallback,
  })
  await triggerFreeswitchSync('number.create', String(created._id))
  return NextResponse.json(phoneNumberToJson(created.toObject()), { status: 201 })
})
