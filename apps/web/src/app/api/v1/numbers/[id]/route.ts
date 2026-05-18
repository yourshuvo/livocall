export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { PhoneNumber } from '@/models/PhoneNumber'
import { Agent } from '@/models/Agent'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'
import { phoneNumberToJson } from '@/lib/serialize'
import { encryptSipPassword, slugifySipProvider } from '@/lib/sip'
import { normalizeAutoCallbackConfig } from '@/lib/auto-callback'

const Patch = z.object({
  agentId: z.string().nullable().optional(),
  providerName: z.string().trim().max(80).optional(),
  providerSlug: z.string().trim().max(64).optional(),
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
  autoCallback: z.unknown().optional(),
})

export const GET = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await authV1(_req, 'numbers:read')
  if (isResponse(auth)) return auth
  const { id } = await ctx.params
  await connectMongo()
  const number = await PhoneNumber.findOne({ _id: id, orgId: auth.orgId }).lean()
  if (!number) return apiError('not_found', 'number not found')
  return NextResponse.json(phoneNumberToJson(number))
})

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await authV1(req, 'numbers:write')
  if (isResponse(auth)) return auth
  const { id } = await ctx.params
  const body = Patch.parse(await req.json().catch(() => ({})))
  const autoCallback =
    body.autoCallback === undefined ? undefined : normalizeAutoCallbackConfig(body.autoCallback)
  await connectMongo()
  if (body.agentId) {
    const agent = await Agent.findOne({ _id: body.agentId, orgId: auth.orgId }).lean()
    if (!agent) return apiError('invalid_input', 'agent does not belong to this org')
  }
  const providerSlug =
    body.providerName || body.providerSlug
      ? slugifySipProvider(body.providerSlug || body.providerName || '')
      : undefined
  const updated = await PhoneNumber.findOneAndUpdate(
    { _id: id, orgId: auth.orgId },
    {
      $set: {
        ...(body.providerName !== undefined ? { providerName: body.providerName } : {}),
        ...(providerSlug !== undefined ? { providerSlug } : {}),
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
        ...(autoCallback !== undefined ? { autoCallback } : {}),
        ...(body.agentId !== undefined
          ? body.agentId === null
            ? { agentId: null }
            : { agentId: body.agentId }
          : {}),
      },
    },
    { new: true },
  ).lean()
  if (!updated) return apiError('not_found', 'number not found')
  return NextResponse.json(phoneNumberToJson(updated))
})
