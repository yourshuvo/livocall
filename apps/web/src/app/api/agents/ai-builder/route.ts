export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  EMPTY_AGENT_BUILDER,
  buildBanglaAgentPrompt,
  type AgentBuilderAnswers,
  type GeneratedAgentPrompt,
} from '@/lib/bangla-agent-builder'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { withErrors } from '@/lib/errors'
import { agentLanguageCodes } from '@/types/agent'
import { OutcomeConfigSchema } from '@/lib/business-outcomes'

const Body = z.object({
  answers: z.object({
    businessName: z.string().max(200).optional().default(''),
    agentName: z.string().max(120).optional().default(''),
    industry: z.string().max(200).optional().default(''),
    callGoal: z.string().max(1200).optional().default(''),
    customerType: z.string().max(600).optional().default(''),
    languageStyle: z.string().max(1200).optional().default(''),
    keyQuestions: z.string().max(2000).optional().default(''),
    kbRules: z.string().max(2000).optional().default(''),
    toolRules: z.string().max(2000).optional().default(''),
    transferRules: z.string().max(2000).optional().default(''),
    complianceRules: z.string().max(2000).optional().default(''),
  }),
})

function mergeAnswers(raw: z.infer<typeof Body>['answers']): AgentBuilderAnswers {
  return { ...EMPTY_AGENT_BUILDER, ...raw }
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

async function generateWithGemini(answers: AgentBuilderAnswers): Promise<GeneratedAgentPrompt | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) return null
  const fallback = buildBanglaAgentPrompt(answers)
  const prompt = `Generate a production-ready Bangla phone-call AI agent prompt as strict JSON.
Return exactly: {"name":"","description":"","language":"bn-en-mixed","system":"","firstMessage":"","guardrails":"","outcomeConfig":{"enabled":true,"labels":[{"key":"order_confirmed","label":"Order confirmed","description":"Caller confirmed the target business outcome.","conversion":true},{"key":"unknown","label":"Unknown","description":"Outcome cannot be confidently determined.","conversion":false}]}}
Rules:
- Bangla-first, natural Bangladesh call-center tone.
- Short, low-latency phone replies.
- One question at a time.
- Enforce KB/tool/transfer/compliance rules.
- Do not invent facts.
- Generate revenue outcome labels automatically from the call goal. Include 3-8 labels, keep an unknown fallback, and mark only true revenue/goal-completion labels as conversion=true.

Answers:
${JSON.stringify(answers, null, 2)}

Fallback draft:
${JSON.stringify(fallback, null, 2)}`
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
          maxOutputTokens: 1800,
        },
      }),
    },
  )
  if (!res.ok) return null
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string') return null
  const parsed = z
    .object({
      name: z.string().min(1).max(120),
      description: z.string().max(400).default(''),
      language: z.enum(agentLanguageCodes).default('bn-en-mixed'),
      system: z.string().min(1).max(8000),
      firstMessage: z.string().min(1).max(2000),
      guardrails: z.string().min(1).max(4000),
      outcomeConfig: OutcomeConfigSchema.optional(),
    })
    .safeParse(JSON.parse(stripCodeFence(text)))
  if (!parsed.success) return null
  return {
    ...parsed.data,
    outcomeConfig: parsed.data.outcomeConfig ?? fallback.outcomeConfig,
  }
}

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const body = Body.parse(await req.json().catch(() => ({})))
  const answers = mergeAnswers(body.answers)
  const generated = (await generateWithGemini(answers)) ?? buildBanglaAgentPrompt(answers)
  return NextResponse.json({
    ...generated,
    aiPowered: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  })
})
