import { z } from 'zod'

export const autoCallbackEligibleOutcomes = ['no_answer', 'busy', 'failed', 'voicemail'] as const

export type AutoCallbackEligibleOutcome = (typeof autoCallbackEligibleOutcomes)[number]

export interface AutoCallbackQuietHours {
  enabled: boolean
  fromMinutes: number
  toMinutes: number
  timezone: string
}

export interface AutoCallbackConfig {
  enabled: boolean
  eligibleOutcomes: AutoCallbackEligibleOutcome[]
  delaySeconds: number
  maxAttempts: number
  retryDelayMinutes: number
  cooldownMinutesPerCaller: number
  maxCallbacksPerDay: number
  quietHours: AutoCallbackQuietHours
}

export const DEFAULT_AUTO_CALLBACK_CONFIG: AutoCallbackConfig = {
  enabled: false,
  eligibleOutcomes: ['no_answer'],
  delaySeconds: 0,
  maxAttempts: 1,
  retryDelayMinutes: 10,
  cooldownMinutesPerCaller: 60,
  maxCallbacksPerDay: 50,
  quietHours: {
    enabled: false,
    fromMinutes: 18 * 60,
    toMinutes: 9 * 60,
    timezone: 'Asia/Dhaka',
  },
}

export const AutoCallbackConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    eligibleOutcomes: z.array(z.enum(autoCallbackEligibleOutcomes)).max(4).optional(),
    delaySeconds: z.number().int().min(0).max(86_400).optional(),
    maxAttempts: z.number().int().min(1).max(5).optional(),
    retryDelayMinutes: z.number().int().min(1).max(10_080).optional(),
    cooldownMinutesPerCaller: z.number().int().min(0).max(10_080).optional(),
    maxCallbacksPerDay: z.number().int().min(1).max(10_000).optional(),
    quietHours: z
      .object({
        enabled: z.boolean().optional(),
        fromMinutes: z.number().int().min(0).max(1439).optional(),
        toMinutes: z.number().int().min(0).max(1439).optional(),
        timezone: z.string().trim().min(1).max(80).optional(),
      })
      .optional(),
  })
  .optional()
  .transform((value) => normalizeAutoCallbackConfig(value))

export function normalizeAutoCallbackConfig(value: unknown): AutoCallbackConfig {
  const raw = value && typeof value === 'object' ? (value as Partial<AutoCallbackConfig>) : {}
  const rawQuiet =
    raw.quietHours && typeof raw.quietHours === 'object'
      ? (raw.quietHours as Partial<AutoCallbackQuietHours>)
      : {}
  const eligible = Array.isArray(raw.eligibleOutcomes)
    ? raw.eligibleOutcomes.filter((outcome): outcome is AutoCallbackEligibleOutcome =>
        (autoCallbackEligibleOutcomes as readonly string[]).includes(String(outcome)),
      )
    : DEFAULT_AUTO_CALLBACK_CONFIG.eligibleOutcomes

  return {
    enabled: Boolean(raw.enabled),
    eligibleOutcomes: eligible.length ? [...new Set(eligible)] : ['no_answer'],
    delaySeconds: clampInt(raw.delaySeconds, 0, 86_400, DEFAULT_AUTO_CALLBACK_CONFIG.delaySeconds),
    maxAttempts: clampInt(raw.maxAttempts, 1, 5, DEFAULT_AUTO_CALLBACK_CONFIG.maxAttempts),
    retryDelayMinutes: clampInt(
      raw.retryDelayMinutes,
      1,
      10_080,
      DEFAULT_AUTO_CALLBACK_CONFIG.retryDelayMinutes,
    ),
    cooldownMinutesPerCaller: clampInt(
      raw.cooldownMinutesPerCaller,
      0,
      10_080,
      DEFAULT_AUTO_CALLBACK_CONFIG.cooldownMinutesPerCaller,
    ),
    maxCallbacksPerDay: clampInt(
      raw.maxCallbacksPerDay,
      1,
      10_000,
      DEFAULT_AUTO_CALLBACK_CONFIG.maxCallbacksPerDay,
    ),
    quietHours: {
      enabled: Boolean(rawQuiet.enabled),
      fromMinutes: clampInt(
        rawQuiet.fromMinutes,
        0,
        1439,
        DEFAULT_AUTO_CALLBACK_CONFIG.quietHours.fromMinutes,
      ),
      toMinutes: clampInt(
        rawQuiet.toMinutes,
        0,
        1439,
        DEFAULT_AUTO_CALLBACK_CONFIG.quietHours.toMinutes,
      ),
      timezone: rawQuiet.timezone || DEFAULT_AUTO_CALLBACK_CONFIG.quietHours.timezone,
    },
  }
}

export function shouldEnqueueMissedCallback({
  config,
  direction,
  outcome,
  callerE164,
}: {
  config: AutoCallbackConfig
  direction: string
  outcome: string
  callerE164: string
}) {
  return (
    config.enabled &&
    direction === 'inbound' &&
    config.eligibleOutcomes.includes(outcome as AutoCallbackEligibleOutcome) &&
    /^\+\d{8,15}$/.test(callerE164)
  )
}

export function nextAllowedCallbackTime(start: Date, config: AutoCallbackConfig): Date {
  const delayed = new Date(start.getTime() + config.delaySeconds * 1000)
  if (!config.quietHours.enabled) return delayed
  return firstNonQuietMinute(delayed, config.quietHours)
}

export function retryCallbackTime(start: Date, config: AutoCallbackConfig): Date {
  const retry = new Date(start.getTime() + config.retryDelayMinutes * 60_000)
  if (!config.quietHours.enabled) return retry
  return firstNonQuietMinute(retry, config.quietHours)
}

export function callbackAttemptStatusForOutcome({
  outcome,
  attempts,
  maxAttempts,
}: {
  outcome: string
  attempts: number
  maxAttempts: number
}): 'completed' | 'failed' | 'queued' {
  if (outcome === 'completed') return 'completed'
  return attempts < maxAttempts ? 'queued' : 'failed'
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function firstNonQuietMinute(start: Date, quietHours: AutoCallbackQuietHours): Date {
  let candidate = new Date(start)
  for (let i = 0; i < 60 * 48; i += 1) {
    if (!isQuietMinute(candidate, quietHours)) return candidate
    candidate = new Date(candidate.getTime() + 60_000)
  }
  return candidate
}

function isQuietMinute(date: Date, quietHours: AutoCallbackQuietHours): boolean {
  const minute = minutesInTimezone(date, quietHours.timezone)
  const from = quietHours.fromMinutes
  const to = quietHours.toMinutes
  if (from === to) return false
  if (from < to) return minute >= from && minute < to
  return minute >= from || minute < to
}

function minutesInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0)
  return hour * 60 + minute
}
