import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { normalizeAutoCallbackConfig } from './auto-callback'

const mocks = vi.hoisted(() => ({
  phoneFindOne: vi.fn(),
  agentFindOne: vi.fn(),
  dncFindOne: vi.fn(),
  missedExists: vi.fn(),
  missedCountDocuments: vi.fn(),
  missedUpdateOne: vi.fn(),
  missedFind: vi.fn(),
  missedFindById: vi.fn(),
  getOriginationGuard: vi.fn(),
  resolveAgentTools: vi.fn(),
  originate: vi.fn(),
}))

vi.mock('@/models/Call', () => ({ Call: {} }))
vi.mock('@/models/PhoneNumber', () => ({
  PhoneNumber: { findOne: (...args: unknown[]) => mocks.phoneFindOne(...args) },
}))
vi.mock('@/models/Agent', () => ({
  Agent: { findOne: (...args: unknown[]) => mocks.agentFindOne(...args) },
}))
vi.mock('@/models/DncEntry', () => ({
  DncEntry: { findOne: (...args: unknown[]) => mocks.dncFindOne(...args) },
}))
vi.mock('@/models/MissedCallback', () => ({
  MissedCallback: {
    exists: (...args: unknown[]) => mocks.missedExists(...args),
    countDocuments: (...args: unknown[]) => mocks.missedCountDocuments(...args),
    updateOne: (...args: unknown[]) => mocks.missedUpdateOne(...args),
    find: (...args: unknown[]) => mocks.missedFind(...args),
    findById: (...args: unknown[]) => mocks.missedFindById(...args),
  },
}))
vi.mock('@/lib/billing-caps', () => ({
  getOriginationGuard: (...args: unknown[]) => mocks.getOriginationGuard(...args),
}))
vi.mock('@/lib/secret-vault', () => ({
  resolveAgentTools: (...args: unknown[]) => mocks.resolveAgentTools(...args),
}))
vi.mock('@/lib/voice-client', () => ({
  voiceClient: { originate: (...args: unknown[]) => mocks.originate(...args) },
}))

import {
  completeMissedCallbackAttempt,
  enqueueMissedCallbackForCall,
  runMissedCallbackTick,
} from './missed-callbacks'

const orgId = new Types.ObjectId()
const phoneNumberId = new Types.ObjectId()
const agentId = new Types.ObjectId()
const sourceCallId = new Types.ObjectId()
const callbackCallId = new Types.ObjectId()
const callerE164 = '+8801712345678'
const numberE164 = '+8801812345678'

function lean<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) }
}

function findResult(items: unknown[]) {
  const limited = { limit: vi.fn().mockResolvedValue(items) }
  return { sort: vi.fn().mockReturnValue(limited) }
}

function number(overrides: Record<string, unknown> = {}) {
  return {
    _id: phoneNumberId,
    orgId,
    e164: numberE164,
    inboundEnabled: true,
    outboundEnabled: true,
    agentId,
    autoCallback: normalizeAutoCallbackConfig({
      enabled: true,
      cooldownMinutesPerCaller: 60,
      maxCallbacksPerDay: 50,
    }),
    ...overrides,
  }
}

function agent(overrides: Record<string, unknown> = {}) {
  return {
    _id: agentId,
    orgId,
    status: 'live',
    tier: 'gemini_live',
    tools: [],
    ...overrides,
  }
}

function sourceCall(overrides: Record<string, unknown> = {}) {
  return {
    _id: sourceCallId,
    orgId,
    agentId,
    direction: 'inbound',
    fromE164: callerE164,
    toE164: numberE164,
    outcome: 'no_answer',
    metadata: {},
    ...overrides,
  } as any
}

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    orgId,
    phoneNumberId,
    agentId,
    sourceCallId,
    callerE164,
    fromE164: numberE164,
    sourceOutcome: 'no_answer',
    status: 'queued',
    attempts: 0,
    maxAttempts: 2,
    nextRunAt: new Date(),
    lastAttemptAt: undefined,
    completedAt: undefined,
    skipReason: '',
    lastError: '',
    policySnapshot: normalizeAutoCallbackConfig({
      enabled: true,
      cooldownMinutesPerCaller: 0,
      maxCallbacksPerDay: 50,
      maxAttempts: 2,
      retryDelayMinutes: 10,
    }),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.missedExists.mockResolvedValue(null)
  mocks.missedCountDocuments.mockResolvedValue(0)
  mocks.missedUpdateOne.mockResolvedValue({ acknowledged: true, upsertedCount: 1 })
  mocks.missedFind.mockReturnValue(findResult([]))
  mocks.missedFindById.mockResolvedValue(null)
  mocks.dncFindOne.mockReturnValue(lean(null))
  mocks.getOriginationGuard.mockResolvedValue({ ok: true })
  mocks.resolveAgentTools.mockResolvedValue([])
  mocks.originate.mockResolvedValue({ callId: callbackCallId.toString() })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('enqueueMissedCallbackForCall', () => {
  it('queues eligible inbound missed calls once per source call id', async () => {
    mocks.phoneFindOne.mockReturnValue(lean(number()))
    mocks.agentFindOne.mockReturnValue(lean(agent()))

    const result = await enqueueMissedCallbackForCall(sourceCall())

    expect(result.enqueued).toBe(true)
    expect(mocks.missedUpdateOne).toHaveBeenCalledWith(
      { sourceCallId },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          orgId,
          phoneNumberId,
          agentId,
          sourceCallId,
          callerE164,
          fromE164: numberE164,
          status: 'queued',
          attempts: 0,
          maxAttempts: 1,
        }),
      }),
      { upsert: true },
    )
  })

  it('does not queue when auto callback is disabled', async () => {
    mocks.phoneFindOne.mockReturnValue(
      lean(number({ autoCallback: normalizeAutoCallbackConfig({ enabled: false }) })),
    )

    const result = await enqueueMissedCallbackForCall(sourceCall())

    expect(result).toMatchObject({ enqueued: false, reason: 'call is not eligible' })
    expect(mocks.missedUpdateOne).not.toHaveBeenCalled()
  })

  it('dedupes duplicate completion events by source call id', async () => {
    mocks.phoneFindOne.mockReturnValue(lean(number()))
    mocks.missedExists.mockResolvedValueOnce({ _id: new Types.ObjectId() })

    const result = await enqueueMissedCallbackForCall(sourceCall())

    expect(result).toMatchObject({ enqueued: false, reason: 'duplicate source call' })
    expect(mocks.missedUpdateOne).not.toHaveBeenCalled()
  })

  it('blocks enqueue while caller cooldown is active', async () => {
    mocks.phoneFindOne.mockReturnValue(lean(number()))
    mocks.agentFindOne.mockReturnValue(lean(agent()))
    mocks.missedExists
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: new Types.ObjectId() })

    const result = await enqueueMissedCallbackForCall(sourceCall())

    expect(result).toMatchObject({ enqueued: false, reason: 'caller cooldown active' })
    expect(mocks.missedUpdateOne).not.toHaveBeenCalled()
  })

  it('blocks enqueue when the daily callback limit is reached', async () => {
    mocks.phoneFindOne.mockReturnValue(lean(number()))
    mocks.agentFindOne.mockReturnValue(lean(agent()))
    mocks.missedExists.mockResolvedValue(null)
    mocks.missedCountDocuments.mockResolvedValue(50)

    const result = await enqueueMissedCallbackForCall(sourceCall())

    expect(result).toMatchObject({ enqueued: false, reason: 'daily callback limit reached' })
    expect(mocks.missedUpdateOne).not.toHaveBeenCalled()
  })
})

describe('runMissedCallbackTick', () => {
  it('originates due callbacks with missed-callback metadata', async () => {
    const item = attempt()
    mocks.missedFind.mockReturnValue(findResult([item]))
    mocks.phoneFindOne.mockReturnValueOnce(lean(number())).mockReturnValueOnce(lean(number()))
    mocks.agentFindOne.mockReturnValueOnce(lean(agent())).mockReturnValueOnce(agent())

    const result = await runMissedCallbackTick()

    expect(result.originated).toBe(1)
    expect(item.status).toBe('in_progress')
    expect(item.attempts).toBe(1)
    expect(item.callbackCallId?.toString()).toBe(callbackCallId.toString())
    expect(mocks.originate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: agentId.toString(),
        toE164: callerE164,
        fromE164: numberE164,
        metadata: expect.objectContaining({
          source: 'missed-callback',
          sourceCallId: sourceCallId.toString(),
          callbackAttemptId: item._id.toString(),
          phoneNumberId: phoneNumberId.toString(),
        }),
      }),
    )
  })

  it('defers due callbacks during quiet hours', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T20:00:00.000Z'))
    const item = attempt({
      policySnapshot: normalizeAutoCallbackConfig({
        enabled: true,
        cooldownMinutesPerCaller: 0,
        quietHours: {
          enabled: true,
          fromMinutes: 18 * 60,
          toMinutes: 9 * 60,
          timezone: 'UTC',
        },
      }),
    })
    mocks.missedFind.mockReturnValue(findResult([item]))

    const result = await runMissedCallbackTick()

    expect(result.deferred).toBe(1)
    expect(item.nextRunAt.toISOString()).toBe('2026-01-02T09:00:00.000Z')
    expect(item.save).toHaveBeenCalled()
    expect(mocks.originate).not.toHaveBeenCalled()
  })

  it('skips DNC destinations before originating', async () => {
    const item = attempt()
    mocks.missedFind.mockReturnValue(findResult([item]))
    mocks.phoneFindOne.mockReturnValueOnce(lean(number()))
    mocks.agentFindOne.mockReturnValueOnce(lean(agent()))
    mocks.dncFindOne.mockReturnValue(lean({ _id: new Types.ObjectId(), e164: callerE164 }))

    const result = await runMissedCallbackTick()

    expect(result.skipped).toBe(1)
    expect(item.status).toBe('skipped')
    expect(item.skipReason).toBe('destination is on the org DNC list')
    expect(mocks.originate).not.toHaveBeenCalled()
  })

  it('skips when spend caps block origination', async () => {
    const item = attempt()
    mocks.missedFind.mockReturnValue(findResult([item]))
    mocks.phoneFindOne.mockReturnValueOnce(lean(number()))
    mocks.agentFindOne.mockReturnValueOnce(lean(agent()))
    mocks.getOriginationGuard.mockResolvedValue({ ok: false, reason: 'daily spend cap reached' })

    const result = await runMissedCallbackTick()

    expect(result.skipped).toBe(1)
    expect(item.status).toBe('skipped')
    expect(item.skipReason).toBe('daily spend cap reached')
    expect(mocks.originate).not.toHaveBeenCalled()
  })

  it('skips when the number has outbound disabled', async () => {
    const item = attempt()
    mocks.missedFind.mockReturnValue(findResult([item]))
    mocks.phoneFindOne.mockReturnValueOnce(lean(number({ outboundEnabled: false })))
    mocks.agentFindOne.mockReturnValueOnce(lean(agent()))

    const result = await runMissedCallbackTick()

    expect(result.skipped).toBe(1)
    expect(item.status).toBe('skipped')
    expect(item.skipReason).toBe('number outbound disabled')
    expect(mocks.originate).not.toHaveBeenCalled()
  })

  it('skips when the assigned agent is no longer live', async () => {
    const item = attempt()
    mocks.missedFind.mockReturnValue(findResult([item]))
    mocks.phoneFindOne.mockReturnValueOnce(lean(number()))
    mocks.agentFindOne.mockReturnValueOnce(lean(agent({ status: 'draft' })))

    const result = await runMissedCallbackTick()

    expect(result.skipped).toBe(1)
    expect(item.status).toBe('skipped')
    expect(item.skipReason).toBe('agent is not live')
    expect(mocks.originate).not.toHaveBeenCalled()
  })

  it('reschedules failed originations while retry attempts remain', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'))
    const item = attempt({
      policySnapshot: normalizeAutoCallbackConfig({
        enabled: true,
        cooldownMinutesPerCaller: 0,
        maxAttempts: 2,
        retryDelayMinutes: 15,
      }),
    })
    mocks.missedFind.mockReturnValue(findResult([item]))
    mocks.phoneFindOne.mockReturnValueOnce(lean(number())).mockReturnValueOnce(lean(number()))
    mocks.agentFindOne.mockReturnValueOnce(lean(agent())).mockReturnValueOnce(agent())
    mocks.originate.mockRejectedValue(new Error('voice unavailable'))

    const result = await runMissedCallbackTick()

    expect(result.failed).toBe(0)
    expect(item.status).toBe('queued')
    expect(item.attempts).toBe(1)
    expect(item.nextRunAt.toISOString()).toBe('2026-01-01T10:15:00.000Z')
    expect(item.lastError).toBe('voice unavailable')
  })
})

describe('completeMissedCallbackAttempt', () => {
  it('links callback calls and queues another try when the call fails before max attempts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'))
    const item = attempt({ attempts: 1, maxAttempts: 2 })
    mocks.missedFindById.mockResolvedValue(item)

    await completeMissedCallbackAttempt(
      sourceCall({
        _id: callbackCallId,
        direction: 'outbound',
        outcome: 'busy',
        hangupCause: 'USER_BUSY',
        metadata: {
          source: 'missed-callback',
          callbackAttemptId: item._id.toString(),
        },
      }),
    )

    expect(item.callbackCallId?.toString()).toBe(callbackCallId.toString())
    expect(item.status).toBe('queued')
    expect(item.nextRunAt.toISOString()).toBe('2026-01-01T10:10:00.000Z')
    expect(item.lastError).toBe('USER_BUSY')
    expect(item.save).toHaveBeenCalled()
  })
})
