export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectMongo } from '@/lib/db'
import { Agent } from '@/models/Agent'
import { authV1, isResponse } from '@/lib/auth/v1'
import { apiError, withErrors } from '@/lib/errors'
import { agentToJson } from '@/lib/serialize'

export const GET = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const auth = await authV1(req, 'agents:read')
  if (isResponse(auth)) return auth
  if (!Types.ObjectId.isValid(ctx.params.id)) return apiError('invalid_input')
  await connectMongo()
  const agent = await Agent.findOne({ _id: ctx.params.id, orgId: auth.orgId }).lean()
  if (!agent) return apiError('not_found')
  return NextResponse.json(agentToJson(agent))
})
