import { z } from 'zod'
import { redactPii } from '@/lib/compliance'

export const DEFAULT_OUTCOME_LABELS = [
  {
    key: 'interested',
    label: 'Interested',
    description: 'Caller showed buying intent or asked for next steps.',
    conversion: true,
  },
  {
    key: 'not_interested',
    label: 'Not interested',
    description: 'Caller declined the offer or asked not to proceed.',
    conversion: false,
  },
  {
    key: 'callback_requested',
    label: 'Callback requested',
    description: 'Caller asked to be contacted later.',
    conversion: false,
  },
  {
    key: 'purchased',
    label: 'Purchased',
    description: 'Caller confirmed an order, payment, booking, or purchase.',
    conversion: true,
  },
  {
    key: 'complaint',
    label: 'Complaint',
    description: 'Caller raised a complaint, escalation, refund, or service issue.',
    conversion: false,
  },
  {
    key: 'wrong_number',
    label: 'Wrong number',
    description: 'Caller said this is the wrong person or number.',
    conversion: false,
  },
  {
    key: 'unknown',
    label: 'Unknown',
    description: 'Outcome cannot be confidently determined.',
    conversion: false,
  },
] as const

export const OutcomeLabelSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, 'use lowercase letters, numbers, and underscores'),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().default(''),
  conversion: z.boolean().optional().default(false),
})

export const OutcomeConfigSchema = z
  .object({
    enabled: z.boolean().optional().default(true),
    labels: z
      .array(OutcomeLabelSchema)
      .max(12)
      .optional()
      .default([...DEFAULT_OUTCOME_LABELS]),
  })
  .transform((value) => normalizeOutcomeConfig(value))

export type OutcomeLabel = z.infer<typeof OutcomeLabelSchema>
export type OutcomeConfig = {
  enabled: boolean
  labels: OutcomeLabel[]
}

export const BusinessOutcomeSchema = z.object({
  key: z.string().trim().toLowerCase(),
  label: z.string().trim().min(1).max(80),
  confidence: z.number().min(0).max(1),
  conversion: z.boolean(),
  amountPaisa: z.number().int().nonnegative().optional().default(0),
  callbackAt: z.string().datetime().optional().nullable(),
  callbackE164: z
    .string()
    .regex(/^\+\d{8,15}$/)
    .optional()
    .nullable(),
  notes: z.string().trim().max(800).optional().default(''),
})

export type BusinessOutcomeInput = z.infer<typeof BusinessOutcomeSchema>

export function normalizeOutcomeConfig(value: unknown): OutcomeConfig {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const parsedLabels = z.array(OutcomeLabelSchema).max(12).safeParse(raw.labels)
  const labels =
    parsedLabels.success && parsedLabels.data.length
      ? parsedLabels.data
      : [...DEFAULT_OUTCOME_LABELS]
  const deduped = new Map<string, OutcomeLabel>()
  for (const label of labels) {
    if (!deduped.has(label.key)) deduped.set(label.key, label)
  }
  if (!deduped.has('unknown')) {
    deduped.set('unknown', {
      key: 'unknown',
      label: 'Unknown',
      description: 'Outcome cannot be confidently determined.',
      conversion: false,
    })
  }
  return {
    enabled: raw.enabled !== false,
    labels: [...deduped.values()].slice(0, 12),
  }
}

export function parseBusinessOutcomeJson(text: string): BusinessOutcomeInput | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    const json = JSON.parse(cleaned)
    return BusinessOutcomeSchema.parse(json)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return BusinessOutcomeSchema.parse(JSON.parse(match[0]))
    } catch {
      return null
    }
  }
}

export function fallbackBusinessOutcome(
  config: OutcomeConfig,
  reason: string,
  confidence = 0.1,
): BusinessOutcomeInput {
  const unknown = config.labels.find((label) => label.key === 'unknown') ?? config.labels[0]
  return {
    key: unknown.key,
    label: unknown.label,
    confidence,
    conversion: Boolean(unknown.conversion),
    amountPaisa: 0,
    callbackAt: null,
    callbackE164: null,
    notes: redactPii(reason),
  }
}

export function normalizeBusinessOutcome(
  input: BusinessOutcomeInput | null,
  config: OutcomeConfig,
): BusinessOutcomeInput {
  if (!input)
    return fallbackBusinessOutcome(config, 'Outcome extraction did not return valid JSON.')
  const label = config.labels.find((item) => item.key === input.key)
  if (!label)
    return fallbackBusinessOutcome(config, `Model returned unknown outcome key: ${input.key}.`)
  return {
    key: label.key,
    label: label.label,
    confidence: input.confidence,
    conversion: label.conversion,
    amountPaisa: input.amountPaisa || 0,
    callbackAt: input.callbackAt || null,
    callbackE164: input.callbackE164 || null,
    notes: redactPii(input.notes || ''),
  }
}

export function transcriptCorpus(
  turns: { role?: string | null; text?: string | null }[] | null | undefined,
): string {
  return (turns || [])
    .filter((turn) => String(turn.text || '').trim())
    .map(
      (turn) =>
        `${String(turn.role || 'unknown').toUpperCase()}: ${String(turn.text || '').trim()}`,
    )
    .join('\n')
}

export function buildOutcomePrompt({
  config,
  transcript,
  metadata,
}: {
  config: OutcomeConfig
  transcript: string
  metadata: unknown
}) {
  const labels = config.labels
    .map(
      (label) =>
        `- ${label.key}: ${label.label}. ${label.description || 'No description.'} conversion=${label.conversion}`,
    )
    .join('\n')
  return `Classify this phone call into exactly one configured business outcome.

Return strict JSON only with:
{
  "key": "one configured key",
  "label": "human label",
  "confidence": 0.0,
  "conversion": false,
  "amountPaisa": 0,
  "callbackAt": null,
  "callbackE164": null,
  "notes": "short CRM note"
}

Configured outcomes:
${labels}

Rules:
- Use only one configured key.
- If the caller asks for a callback, set callbackAt when a clear date/time is present, otherwise null.
- Store money as integer paisa when an amount is clearly discussed; otherwise 0.
- Keep notes under two short sentences.
- If uncertain, use unknown.

Call metadata:
${JSON.stringify(metadata || {}).slice(0, 1200)}

Transcript:
${transcript.slice(0, 8000)}`
}

export function campaignOutcomeStatus({
  telephonyOutcome,
  businessOutcome,
  attempts,
  maxAttempts,
}: {
  telephonyOutcome: string
  businessOutcome?: {
    key?: string | null
    conversion?: boolean | null
    callbackAt?: Date | string | null
  } | null
  attempts: number
  maxAttempts: number
}) {
  const lastOutcome = businessOutcome?.key || telephonyOutcome
  const conversion = businessOutcome
    ? Boolean(businessOutcome.conversion)
    : telephonyOutcome === 'completed'
  if (conversion) return { status: 'completed' as const, lastOutcome, nextRetryAt: undefined }
  if (businessOutcome?.callbackAt && attempts < maxAttempts) {
    return {
      status: 'queued' as const,
      lastOutcome,
      nextRetryAt: new Date(businessOutcome.callbackAt),
    }
  }
  return { status: 'failed_terminal' as const, lastOutcome, nextRetryAt: undefined }
}
