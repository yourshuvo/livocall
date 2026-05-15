import type { AgentLean } from '@/models/Agent'
import type { CallDoc } from '@/models/Call'
import {
  buildOutcomePrompt,
  fallbackBusinessOutcome,
  normalizeBusinessOutcome,
  normalizeOutcomeConfig,
  parseBusinessOutcomeJson,
  transcriptCorpus,
} from '@/lib/business-outcomes'

async function geminiGenerate(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) return ''
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  )
  if (!res.ok) throw new Error(`Gemini outcome extraction failed: ${res.status}`)
  const data = await res.json()
  let text = ''
  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (typeof part.text === 'string') text += part.text
    }
  }
  return text
}

export async function analyzeBusinessOutcome(call: CallDoc, agent: AgentLean | null) {
  const config = normalizeOutcomeConfig(agent?.outcomeConfig)
  if (!config.enabled) return null
  const corpus = transcriptCorpus(call.transcript)
  if (!corpus) {
    return {
      ...fallbackBusinessOutcome(config, 'No transcript was available for outcome extraction.'),
      extractedAt: new Date(),
    }
  }
  try {
    const text = await geminiGenerate(
      buildOutcomePrompt({
        config,
        transcript: corpus,
        metadata: call.metadata,
      }),
    )
    const parsed = text ? parseBusinessOutcomeJson(text) : null
    return {
      ...normalizeBusinessOutcome(
        parsed ?? fallbackBusinessOutcome(config, 'AI outcome extraction is not configured.'),
        config,
      ),
      extractedAt: new Date(),
    }
  } catch (e) {
    return {
      ...fallbackBusinessOutcome(
        config,
        e instanceof Error ? e.message : 'Outcome extraction failed.',
      ),
      extractedAt: new Date(),
    }
  }
}
