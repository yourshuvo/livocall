import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ connectMongo: vi.fn().mockResolvedValue(undefined) }))
const aggregate = vi.fn()
vi.mock('@/models/LedgerEntry', () => ({
  LedgerEntry: { aggregate: (...args: unknown[]) => aggregate(...args) },
}))

import { getCapSnapshot } from './billing-caps'

describe('getCapSnapshot', () => {
  beforeEach(() => {
    aggregate.mockReset()
  })

  it('returns zeros when no ledger rows', async () => {
    aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const snap = await getCapSnapshot('org1', 100, 1000)
    expect(snap.spentTodayPaisa).toBe(0)
    expect(snap.spentThisMonthPaisa).toBe(0)
    expect(snap.dailyExceeded).toBe(false)
    expect(snap.monthlyExceeded).toBe(false)
  })

  it('flags daily exceeded when spend equals cap', async () => {
    aggregate
      .mockResolvedValueOnce([{ sum: -100 }])
      .mockResolvedValueOnce([{ sum: -100 }])
    const snap = await getCapSnapshot('org1', 100, 1000)
    expect(snap.spentTodayPaisa).toBe(100)
    expect(snap.dailyExceeded).toBe(true)
    expect(snap.monthlyExceeded).toBe(false)
  })

  it('treats 0 cap as disabled', async () => {
    aggregate
      .mockResolvedValueOnce([{ sum: -9999 }])
      .mockResolvedValueOnce([{ sum: -9999 }])
    const snap = await getCapSnapshot('org1', 0, 0)
    expect(snap.dailyExceeded).toBe(false)
    expect(snap.monthlyExceeded).toBe(false)
  })

  it('flags monthly exceeded independently', async () => {
    aggregate
      .mockResolvedValueOnce([{ sum: -50 }])
      .mockResolvedValueOnce([{ sum: -1500 }])
    const snap = await getCapSnapshot('org1', 200, 1000)
    expect(snap.spentTodayPaisa).toBe(50)
    expect(snap.spentThisMonthPaisa).toBe(1500)
    expect(snap.dailyExceeded).toBe(false)
    expect(snap.monthlyExceeded).toBe(true)
  })
})
