export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Agent } from '@/models/Agent'
import { AgentVersion } from '@/models/AgentVersion'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { requireRole } from '@/lib/rbac'
import { agentToJson } from '@/lib/serialize'

const Body = z.object({
  versionId: z.string().regex(/^[a-fA-F0-9]{24}$/),
})

function restorePayload(snapshot: Record<string, unknown>) {
  return {
    name: snapshot.name,
    description: snapshot.description,
    tier: snapshot.tier,
    model: snapshot.model,
    language: snapshot.language,
    voice: snapshot.voice,
    prompt: snapshot.prompt,
    dtmf: snapshot.dtmf,
    tools: snapshot.tools,
    knowledgeBaseIds: snapshot.knowledgeBaseIds,
    postCallWebhook: snapshot.postCallWebhook,
    runtimeSettings: snapshot.runtimeSettings,
    status: snapshot.status,
  }
}

export const GET = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input', 'invalid id')
  await connectMongo()
  const rows = await AgentVersion.find({ orgId: s.orgId, agentId: oid })
    .sort({ createdAt: -1 })
    .limit(25)
    .lean()
  return NextResponse.json({
    versions: rows.map((row) => ({
      id: String(row._id),
      label: row.label,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy ? String(row.createdBy) : null,
      snapshot: row.snapshot,
    })),
  })
})

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const forbidden = requireRole(s, 'admin')
  if (forbidden) return forbidden
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input', 'invalid id')
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const [agent, version] = await Promise.all([
    Agent.findOne({ _id: oid, orgId: s.orgId }).lean(),
    AgentVersion.findOne({ _id: body.versionId, orgId: s.orgId, agentId: oid }).lean(),
  ])
  if (!agent) return apiError('not_found')
  if (!version) return apiError('not_found', 'version not found')

  await AgentVersion.create({
    orgId: s.orgId,
    agentId: oid,
    createdBy: s.userId,
    label: 'Before rollback',
    snapshot: agentToJson(agent),
  })

  const updated = await Agent.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $set: restorePayload(version.snapshot as Record<string, unknown>) },
    { new: true },
  ).lean()
  if (!updated) return apiError('not_found')
  return NextResponse.json(agentToJson(updated))
})
