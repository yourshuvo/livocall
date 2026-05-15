import { describe, expect, it } from 'vitest'
import { analyzeBusinessOutcome } from '@/lib/business-outcome-analyzer'
import {
  DEFAULT_OUTCOME_LABELS,
  OutcomeConfigSchema,
  campaignOutcomeStatus,
  normalizeBusinessOutcome,
  normalizeOutcomeConfig,
  parseBusinessOutcomeJson,
} from '@/lib/business-outcomes'

describe('business outcome config', () => {
  it('normalizes default labels and keeps an unknown fallback', () => {
    const config = normalizeOutcomeConfig({})

    expect(config.enabled).toBe(true)
    expect(config.labels.map((label) => label.key)).toContain('unknown')
    expect(config.labels.length).toBe(DEFAULT_OUTCOME_LABELS.length)
  })

  it('rejects too many labels and invalid keys', () => {
    const labels = Array.from({ length: 13 }, (_, i) => ({
      key: `label_${i}`,
      label: `Label ${i}`,
      conversion: false,
    }))

    expect(OutcomeConfigSchema.safeParse({ labels }).success).toBe(false)
    expect(
      OutcomeConfigSchema.safeParse({
        labels: [{ key: 'Bad Key', label: 'Bad key', conversion: false }],
      }).success,
    ).toBe(false)
  })
})

describe('business outcome parsing', () => {
  const config = normalizeOutcomeConfig({
    enabled: true,
    labels: [
      {
        key: 'purchased',
        label: 'Purchased',
        description: 'Confirmed purchase.',
        conversion: true,
      },
      {
        key: 'unknown',
        label: 'Unknown',
        description: 'Fallback.',
        conversion: false,
      },
    ],
  })

  it('parses strict JSON and applies configured conversion metadata', () => {
    const parsed = parseBusinessOutcomeJson(
      '{"key":"purchased","label":"Purchased","confidence":0.9,"conversion":false,"amountPaisa":120000,"callbackAt":null,"callbackE164":null,"notes":"Order confirmed."}',
    )
    const normalized = normalizeBusinessOutcome(parsed, config)

    expect(normalized.key).toBe('purchased')
    expect(normalized.conversion).toBe(true)
    expect(normalized.amountPaisa).toBe(120000)
  })

  it('falls back when JSON is invalid', () => {
    const normalized = normalizeBusinessOutcome(parseBusinessOutcomeJson('not json'), config)

    expect(normalized.key).toBe('unknown')
    expect(normalized.confidence).toBeLessThan(0.2)
  })

  it('falls back when no transcript is available', async () => {
    const outcome = await analyzeBusinessOutcome(
      { transcript: [], metadata: {} } as any,
      { outcomeConfig: config } as any,
    )

    expect(outcome?.key).toBe('unknown')
    expect(outcome?.confidence).toBeLessThan(0.2)
  })
})

describe('campaign outcome status', () => {
  it('completes only conversion outcomes', () => {
    expect(
      campaignOutcomeStatus({
        telephonyOutcome: 'completed',
        businessOutcome: { key: 'purchased', conversion: true },
        attempts: 1,
        maxAttempts: 2,
      }).status,
    ).toBe('completed')

    expect(
      campaignOutcomeStatus({
        telephonyOutcome: 'completed',
        businessOutcome: { key: 'not_interested', conversion: false },
        attempts: 1,
        maxAttempts: 2,
      }).status,
    ).toBe('failed_terminal')
  })

  it('queues callback outcomes when another attempt remains', () => {
    const callbackAt = new Date(Date.now() + 60_000).toISOString()
    const next = campaignOutcomeStatus({
      telephonyOutcome: 'completed',
      businessOutcome: { key: 'callback_requested', conversion: false, callbackAt },
      attempts: 1,
      maxAttempts: 2,
    })

    expect(next.status).toBe('queued')
    expect(next.lastOutcome).toBe('callback_requested')
    expect(next.nextRetryAt?.toISOString()).toBe(callbackAt)
  })
})
