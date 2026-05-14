import { describe, it, expect } from 'vitest'
import { signWebhook, verifyWebhook, randomToken } from './hmac'

describe('signWebhook / verifyWebhook', () => {
  const secret = 'whsec_unit_test_secret_xxxxxxxxxxxxxx'
  const body = JSON.stringify({ event: 'call.completed', durationSec: 42 })

  it('produces a t=,v1= header', () => {
    const sig = signWebhook(secret, body, 1700000000_000)
    expect(sig).toMatch(/^t=1700000000,v1=[a-f0-9]{64}$/)
  })

  it('round-trips', () => {
    const now = Date.now()
    const sig = signWebhook(secret, body, now)
    expect(verifyWebhook(secret, body, sig, 300, now)).toBe(true)
  })

  it('rejects after the tolerance window expires', () => {
    const t = 1700000000_000
    const sig = signWebhook(secret, body, t)
    // 10 minutes later, with a 60-second tolerance.
    expect(verifyWebhook(secret, body, sig, 60, t + 10 * 60 * 1000)).toBe(false)
  })

  it('rejects body tampering', () => {
    const now = Date.now()
    const sig = signWebhook(secret, body, now)
    expect(verifyWebhook(secret, body + '!', sig, 300, now)).toBe(false)
  })

  it('rejects garbage headers', () => {
    expect(verifyWebhook(secret, body, 'nonsense', 300)).toBe(false)
    expect(verifyWebhook(secret, body, 't=abc,v1=zzz', 300)).toBe(false)
  })
})

describe('randomToken', () => {
  it('uses the requested prefix and is base64url', () => {
    const t = randomToken('lvo_', 24)
    expect(t.startsWith('lvo_')).toBe(true)
    const tail = t.slice(4)
    expect(tail).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces unique tokens', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(randomToken('x_', 16))
    expect(seen.size).toBe(100)
  })
})
