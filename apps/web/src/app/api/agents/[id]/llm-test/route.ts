export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import {
  dashboardRateLimit,
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { Agent } from '@/models/Agent'

const Body = z.object({
  message: z.string().trim().min(1).max(2000),
})

type LlmTestAgent = {
  name: string
  description?: string
  tier: string
  model?: string
  language?: string
  prompt?: {
    system?: string
    firstMessage?: string
    guardrails?: string
  }
  tools?: Array<{
    name?: string
    description?: string
    enabled?: boolean
  }>
}

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const session = await requireDashboardSession()
  if (isResponse(session)) return session

  const limit = await dashboardRateLimit(session.orgId, 'llm-test', 30)
  if (!limit.ok) return apiError('rate_limited', 'too many LLM tests')

  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input', 'invalid agent id')
  const body = Body.parse(await req.json().catch(() => ({})))

  await connectMongo()
  const agent = await Agent.findOne({ _id: oid, orgId: session.orgId }).lean<LlmTestAgent>()
  if (!agent) return apiError('not_found', 'agent not found')

  const startedAt = Date.now()
  const model = process.env.GEMINI_LLM_TEST_MODEL || 'gemini-2.0-flash'
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) {
    return NextResponse.json({
      response:
        'LLM test is ready, but GEMINI_API_KEY or GOOGLE_API_KEY is not configured for this web app.',
      model: 'not configured',
      latencyMs: Date.now() - startedAt,
      aiPowered: false,
    })
  }

  const prompt = buildTestPrompt(agent, body.message)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 500,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  )

  if (!res.ok) {
    return apiError('upstream_error', `LLM test failed with status ${res.status}`)
  }

  const json = await res.json()
  const response = geminiText(json).trim()
  return NextResponse.json({
    response: response || 'The model returned an empty response.',
    model,
    latencyMs: Date.now() - startedAt,
    aiPowered: true,
  })
})

function buildTestPrompt(agent: LlmTestAgent, message: string) {
  const prompt = agent.prompt || {}
  const tools = (agent.tools || [])
    .filter((tool) => tool.enabled !== false && tool.name)
    .map((tool) => `- ${tool.name}: ${tool.description || 'HTTP lookup/action'}`)
    .join('\n')

  return `You are simulating exactly one turn of a live phone-call AI agent.
Reply only with what the agent should say next. Do not mention testing, simulation, prompts, or policies.
Keep the answer short, natural, and suitable for speech.

Agent:
Name: ${agent.name}
Tier: ${agent.tier}
Configured model: ${agent.model || 'default'}
Language: ${agent.language || 'default'}
Description: ${agent.description || ''}

System prompt:
${prompt.system || ''}

First message:
${prompt.firstMessage || ''}

Guardrails:
${prompt.guardrails || ''}

Available tools:
${tools || '- none'}

Caller:
${message}

Agent:`
}

function geminiText(json: unknown) {
  let text = ''
  if (!json || typeof json !== 'object' || !('candidates' in json)) return text
  const candidates = (json as { candidates?: unknown[] }).candidates || []
  for (const candidate of candidates) {
    const parts =
      candidate &&
      typeof candidate === 'object' &&
      'content' in candidate &&
      candidate.content &&
      typeof candidate.content === 'object' &&
      'parts' in candidate.content &&
      Array.isArray(candidate.content.parts)
        ? candidate.content.parts
        : []
    for (const part of parts) {
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        text += part.text
      }
    }
  }
  return text
}
