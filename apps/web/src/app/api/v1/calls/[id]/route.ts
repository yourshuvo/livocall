export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectMongo } from '@/lib/db'
import { Call } from '@/models/Call'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'
import { callToJson } from '@/lib/serialize'
import { voiceClient } from '@/lib/voice-client'

export const GET = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const auth = await authV1(req, 'calls:read')
  if (isResponse(auth)) return auth
  if (!Types.ObjectId.isValid(id)) return apiError('invalid_input')
  await connectMongo()
  const call = await Call.findOne({ _id: id, orgId: auth.orgId }).lean()
  if (!call) return apiError('not_found')
  return NextResponse.json(callToJson(call))
})

export const DELETE = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const auth = await authV1(req, 'calls:write')
  if (isResponse(auth)) return auth
  if (!Types.ObjectId.isValid(id)) return apiError('invalid_input')
  await connectMongo()
  const call = await Call.findOne({ _id: id, orgId: auth.orgId })
  if (!call) return apiError('not_found')
  if (call.outcome !== 'in_progress') return apiError('conflict', 'call is not in progress')
  try {
    await voiceClient.hangup(String(call._id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError('upstream_error', e instanceof Error ? e.message : 'voice service error')
  }
})
