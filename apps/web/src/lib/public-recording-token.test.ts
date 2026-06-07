import { describe, expect, it, vi } from 'vitest'

import { signPublicRecordingToken, verifyPublicRecordingToken } from './public-recording-token'

describe('public recording tokens', () => {
  it('verifies only the intended call id before expiry', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = signPublicRecordingToken('call-123', 'secret', 60)

    expect(verifyPublicRecordingToken('call-123', token, 'secret')).toBe(true)
    expect(verifyPublicRecordingToken('call-456', token, 'secret')).toBe(false)
  })

  it('rejects expired or malformed tokens', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = signPublicRecordingToken('call-123', 'secret', 1)

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'))

    expect(verifyPublicRecordingToken('call-123', token, 'secret')).toBe(false)
    expect(verifyPublicRecordingToken('call-123', 'bad-token', 'secret')).toBe(false)
    expect(verifyPublicRecordingToken('call-123', token, '')).toBe(false)
  })
})
