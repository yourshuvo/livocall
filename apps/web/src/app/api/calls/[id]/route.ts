export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { Call } from '@/models/Call'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { callToJson } from '@/lib/serialize'
import { voiceClient } from '@/lib/voice-client'

export const GET = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const call = await Call.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!call) return apiError('not_found')
  return NextResponse.json(callToJson(call))
})

export const DELETE = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  // hangup an in-progress call
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const call = await Call.findOne({ _id: oid, orgId: s.orgId })
  if (!call) return apiError('not_found')
  if (call.outcome !== 'in_progress') return apiError('conflict', 'call is not in progress')
  try {
    await voiceClient.hangup(String(call._id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError('upstream_error', e instanceof Error ? e.message : 'voice service error')
  }
})
