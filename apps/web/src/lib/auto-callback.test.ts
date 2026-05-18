import { describe, expect, it } from 'vitest'
import {
  callbackAttemptStatusForOutcome,
  nextAllowedCallbackTime,
  normalizeAutoCallbackConfig,
  retryCallbackTime,
  shouldEnqueueMissedCallback,
} from './auto-callback'

describe('auto callback config', () => {
  it('defaults to disabled no-answer callbacks with safe limits', () => {
    const config = normalizeAutoCallbackConfig(undefined)

    expect(config).toMatchObject({
      enabled: false,
      eligibleOutcomes: ['no_answer'],
      delaySeconds: 0,
      maxAttempts: 1,
      retryDelayMinutes: 10,
      cooldownMinutesPerCaller: 60,
      maxCallbacksPerDay: 50,
      quietHours: {
        enabled: false,
        timezone: 'Asia/Dhaka',
      },
    })
  })

  it('dedupes outcomes and clamps numeric policy fields', () => {
    const config = normalizeAutoCallbackConfig({
      enabled: true,
      eligibleOutcomes: ['busy', 'busy', 'bad'],
      delaySeconds: 99_999,
      maxAttempts: 12,
      retryDelayMinutes: -1,
      cooldownMinutesPerCaller: 20_000,
      maxCallbacksPerDay: 0,
      quietHours: {
        enabled: true,
        fromMinutes: -30,
        toMinutes: 2000,
        timezone: 'UTC',
      },
    })

    expect(config.eligibleOutcomes).toEqual(['busy'])
    expect(config.delaySeconds).toBe(86_400)
    expect(config.maxAttempts).toBe(5)
    expect(config.retryDelayMinutes).toBe(1)
    expect(config.cooldownMinutesPerCaller).toBe(10_080)
    expect(config.maxCallbacksPerDay).toBe(1)
    expect(config.quietHours).toMatchObject({
      enabled: true,
      fromMinutes: 0,
      toMinutes: 1439,
      timezone: 'UTC',
    })
  })
})

describe('auto callback eligibility', () => {
  const config = normalizeAutoCallbackConfig({
    enabled: true,
    eligibleOutcomes: ['no_answer', 'busy'],
  })

  it('accepts eligible inbound missed calls with a valid caller number', () => {
    expect(
      shouldEnqueueMissedCallback({
        config,
        direction: 'inbound',
        outcome: 'no_answer',
        callerE164: '+8801712345678',
      }),
    ).toBe(true)
  })

  it('rejects disabled, outbound, ineligible, and invalid caller cases', () => {
    expect(
      shouldEnqueueMissedCallback({
        config: { ...config, enabled: false },
        direction: 'inbound',
        outcome: 'no_answer',
        callerE164: '+8801712345678',
      }),
    ).toBe(false)
    expect(
      shouldEnqueueMissedCallback({
        config,
        direction: 'outbound',
        outcome: 'no_answer',
        callerE164: '+8801712345678',
      }),
    ).toBe(false)
    expect(
      shouldEnqueueMissedCallback({
        config,
        direction: 'inbound',
        outcome: 'completed',
        callerE164: '+8801712345678',
      }),
    ).toBe(false)
    expect(
      shouldEnqueueMissedCallback({
        config,
        direction: 'inbound',
        outcome: 'busy',
        callerE164: '01712345678',
      }),
    ).toBe(false)
  })
})

describe('auto callback timing', () => {
  it('applies the initial delay when quiet hours are disabled', () => {
    const start = new Date('2026-01-01T00:00:00.000Z')
    const config = normalizeAutoCallbackConfig({ enabled: true, delaySeconds: 90 })

    expect(nextAllowedCallbackTime(start, config).toISOString()).toBe('2026-01-01T00:01:30.000Z')
  })

  it('defers first callbacks until the next non-quiet minute', () => {
    const start = new Date('2026-01-01T20:30:00.000Z')
    const config = normalizeAutoCallbackConfig({
      enabled: true,
      quietHours: {
        enabled: true,
        fromMinutes: 18 * 60,
        toMinutes: 9 * 60,
        timezone: 'UTC',
      },
    })

    expect(nextAllowedCallbackTime(start, config).toISOString()).toBe('2026-01-02T09:00:00.000Z')
  })

  it('applies retry delay and quiet-hours deferral together', () => {
    const start = new Date('2026-01-01T17:55:00.000Z')
    const config = normalizeAutoCallbackConfig({
      enabled: true,
      retryDelayMinutes: 10,
      quietHours: {
        enabled: true,
        fromMinutes: 18 * 60,
        toMinutes: 9 * 60,
        timezone: 'UTC',
      },
    })

    expect(retryCallbackTime(start, config).toISOString()).toBe('2026-01-02T09:00:00.000Z')
  })
})

describe('auto callback attempt status', () => {
  it('completes on successful callback calls', () => {
    expect(
      callbackAttemptStatusForOutcome({ outcome: 'completed', attempts: 1, maxAttempts: 3 }),
    ).toBe('completed')
  })

  it('queues while retries remain and fails after the last attempt', () => {
    expect(callbackAttemptStatusForOutcome({ outcome: 'busy', attempts: 1, maxAttempts: 3 })).toBe(
      'queued',
    )
    expect(callbackAttemptStatusForOutcome({ outcome: 'busy', attempts: 3, maxAttempts: 3 })).toBe(
      'failed',
    )
  })
})
