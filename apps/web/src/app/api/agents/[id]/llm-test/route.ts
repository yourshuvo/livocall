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

const ChatMessage = z.object({
  role: z.enum(['caller', 'agent']),
  text: z.string().trim().min(1).max(2000),
})

const Body = z
  .object({
    message: z.string().trim().min(1).max(2000).optional(),
    messages: z.array(ChatMessage).max(20).optional(),
  })
  .refine((body) => Boolean(body.message || body.messages?.length), {
    message: 'message or messages is required',
    path: ['message'],
  })

type ChatMessage = z.infer<typeof ChatMessage>

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

  const messages = normalizeMessages(body)
  const prompt = buildTestPrompt(agent, messages)
  const attempts: Array<{ model: string; status: number; message: string }> = []
  for (const model of llmTestModels(agent)) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': key,
        },
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

    if (res.ok) {
      const json = await res.json()
      const response = geminiText(json).trim()
      return NextResponse.json({
        response: response || 'The model returned an empty response.',
        model,
        latencyMs: Date.now() - startedAt,
        aiPowered: true,
      })
    }

    const message = await geminiErrorMessage(res)
    attempts.push({ model, status: res.status, message })
    if (res.status === 401 || res.status === 403) break
  }

  const last = attempts.at(-1)
  return apiError(
    'upstream_error',
    last
      ? `LLM test failed for ${last.model} with status ${last.status}: ${last.message}`
      : 'LLM test failed before contacting Gemini',
    attempts,
  )
})

function llmTestModels(agent: LlmTestAgent) {
  const values = [
    process.env.GEMINI_LLM_TEST_MODEL,
    textGenerationModel(agent.model),
    process.env.PIPELINE_LLM_MODEL,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
  ]
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[]
}

function textGenerationModel(value?: string) {
  const model = value?.trim().replace(/^models\//, '') || ''
  if (!model || model.includes('live') || model.startsWith('grok-')) return ''
  if (model.startsWith('gemini-')) return model
  return ''
}

async function geminiErrorMessage(res: Response) {
  const body = await res.text().catch(() => '')
  if (!body) return res.statusText || 'Gemini returned an empty error'
  try {
    const json = JSON.parse(body) as { error?: { message?: unknown; status?: unknown } }
    const message = typeof json.error?.message === 'string' ? json.error.message : ''
    const status = typeof json.error?.status === 'string' ? json.error.status : ''
    return [status, message].filter(Boolean).join(': ') || body.slice(0, 300)
  } catch {
    return body.slice(0, 300)
  }
}

function normalizeMessages(body: z.infer<typeof Body>): ChatMessage[] {
  if (body.messages?.length) return body.messages
  return [{ role: 'caller', text: body.message || '' }]
}

function buildTestPrompt(agent: LlmTestAgent, messages: ChatMessage[]) {
  const prompt = agent.prompt || {}
  const tools = (agent.tools || [])
    .filter((tool) => tool.enabled !== false && tool.name)
    .map((tool) => `- ${tool.name}: ${tool.description || 'HTTP lookup/action'}`)
    .join('\n')
  const transcript = messages
    .map((message) => `${message.role === 'agent' ? 'Agent' : 'Caller'}: ${message.text}`)
    .join('\n')
  const last = [...messages].reverse().find((message) => message.role === 'caller')

  return `You are continuing a live phone-call conversation as the agent.
Reply only with the agent's next message. Do not mention testing, simulation, prompts, or policies.
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

Conversation so far:
${transcript}

Latest caller message:
${last?.text || ''}

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
