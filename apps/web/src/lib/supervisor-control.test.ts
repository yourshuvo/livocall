import { describe, expect, it } from 'vitest'
import {
  SupervisorControlBody,
  supervisorFailureEvent,
  supervisorSuccessEvent,
} from './supervisor-control'

describe('SupervisorControlBody', () => {
  it('accepts listen and barge with an E.164 supervisor number', () => {
    expect(SupervisorControlBody.parse({ action: 'listen', targetE164: '+8801712345678' })).toEqual(
      { action: 'listen', targetE164: '+8801712345678' },
    )
    expect(SupervisorControlBody.parse({ action: 'barge', targetE164: '+14155550123' })).toEqual({
      action: 'barge',
      targetE164: '+14155550123',
    })
  })

  it('rejects whisper and non-E.164 target numbers', () => {
    expect(() =>
      SupervisorControlBody.parse({ action: 'whisper', targetE164: '+8801712345678' }),
    ).toThrow()
    expect(() =>
      SupervisorControlBody.parse({ action: 'listen', targetE164: '01712345678' }),
    ).toThrow()
  })
})

describe('supervisor event builders', () => {
  it('records successful supervisor events with the attached leg UUID', () => {
    const event = supervisorSuccessEvent({
      action: 'barge',
      supervisorId: 'user-1',
      targetE164: '+8801712345678',
      result: { ok: true, supervisorLegUuid: 'leg-1' },
    })

    expect(event).toMatchObject({
      action: 'barge',
      supervisorId: 'user-1',
      ok: true,
      targetE164: '+8801712345678',
      supervisorLegUuid: 'leg-1',
    })
    expect(event.at).toBeInstanceOf(Date)
  })

  it('records failed supervisor events with an error message', () => {
    const event = supervisorFailureEvent({
      action: 'listen',
      supervisorId: 'user-1',
      targetE164: '+8801712345678',
      error: new Error('voice service unavailable'),
    })

    expect(event).toMatchObject({
      action: 'listen',
      supervisorId: 'user-1',
      ok: false,
      targetE164: '+8801712345678',
      error: 'voice service unavailable',
    })
  })
})
