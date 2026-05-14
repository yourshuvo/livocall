import { describe, it, expect } from 'vitest'
import { rateLimit, _resetRateLimit as _resetRateLimitForTests } from './rate-limit'

describe('rateLimit', () => {
  it('allows up to capacity then blocks', async () => {
    _resetRateLimitForTests()
    for (let i = 0; i < 3; i++) {
      const r = await rateLimit({ key: 'unit:burst', capacity: 3, refillPerSec: 0 })
      expect(r.ok).toBe(true)
    }
    const blocked = await rateLimit({ key: 'unit:burst', capacity: 3, refillPerSec: 0 })
    expect(blocked.ok).toBe(false)
  })

  it('refills tokens over time', async () => {
    _resetRateLimitForTests()
    // capacity 2, refill 1000/s — both first calls drain, third should still pass after small wait
    await rateLimit({ key: 'unit:refill', capacity: 2, refillPerSec: 1000 })
    await rateLimit({ key: 'unit:refill', capacity: 2, refillPerSec: 1000 })
    await new Promise((r) => setTimeout(r, 5))
    const r = await rateLimit({ key: 'unit:refill', capacity: 2, refillPerSec: 1000 })
    expect(r.ok).toBe(true)
  })

  it('separate keys do not interfere', async () => {
    _resetRateLimitForTests()
    const a = await rateLimit({ key: 'unit:a', capacity: 1, refillPerSec: 0 })
    const a2 = await rateLimit({ key: 'unit:a', capacity: 1, refillPerSec: 0 })
    const b = await rateLimit({ key: 'unit:b', capacity: 1, refillPerSec: 0 })
    expect(a.ok).toBe(true)
    expect(a2.ok).toBe(false)
    expect(b.ok).toBe(true)
  })
})
