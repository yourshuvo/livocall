export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { Agent } from '@/models/Agent'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { resolveAgentTools } from '@/lib/secret-vault'

const Body = z.object({
  index: z.number().int().min(0),
  arguments: z.record(z.unknown()).optional().default({ query: 'test', notes: 'dashboard test' }),
})

function allowed(url: string, domains: string[] = []) {
  if (!domains.length) return true
  const host = new URL(url).hostname.toLowerCase()
  return domains.some((domain) => host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`))
}

function redactHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      /authorization|token|secret|password|api[-_]?key/i.test(key) ? '[redacted]' : value,
    ]),
  )
}

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input', 'invalid id')
  const body = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const agent = await Agent.findOne({ _id: oid, orgId: s.orgId }).select('+tools.authValue')
  if (!agent) return apiError('not_found')
  const tool = agent.tools?.[body.index]
  if (!tool) return apiError('not_found', 'tool not found')
  if (tool.enabled === false) return apiError('invalid_input', 'tool is disabled')
  if (!tool.url) return apiError('invalid_input', 'tool URL is required')
  if (!allowed(tool.url, tool.allowedDomains ?? [])) {
    return apiError('invalid_input', 'tool URL host is not allowlisted')
  }

  const [resolved] = await resolveAgentTools(String(s.orgId), [JSON.parse(JSON.stringify(tool))])
  const method = String(resolved.method || 'POST').toUpperCase()
  const headers = (resolved.headers ?? {}) as Record<string, string>
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(30000, Number(resolved.timeoutMs ?? 5000)))
  try {
    const res = await fetch(String(resolved.url), {
      method,
      headers,
      signal: controller.signal,
      ...(method === 'GET' ? {} : { body: JSON.stringify(body.arguments) }),
    })
    const text = await res.text()
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      headers: redactHeaders(headers),
      body: text.slice(0, 4000),
    })
  } finally {
    clearTimeout(timer)
  }
})
