import { describe, expect, it } from 'vitest'
import { isE164, normalizeBdPhoneToE164 } from './phone-number'

const iptLocal = ['0963', '914', '8184'].join('')
const iptWithoutTrunk = iptLocal.slice(1)
const iptE164 = `+880${iptWithoutTrunk}`
const mobileLocal = ['0171', '234', '5678'].join('')
const mobileWithoutTrunk = mobileLocal.slice(1)
const mobileE164 = `+880${mobileWithoutTrunk}`
const usE164 = `+1${['415', '555', '2671'].join('')}`

describe('phone number helpers', () => {
  it('normalizes BD IPT local numbers to E.164', () => {
    expect(normalizeBdPhoneToE164(iptLocal)).toBe(iptE164)
    expect(normalizeBdPhoneToE164(`+${iptLocal}`)).toBe(iptE164)
    expect(normalizeBdPhoneToE164(iptWithoutTrunk)).toBe(iptE164)
  })

  it('normalizes BD mobile local numbers to E.164', () => {
    expect(normalizeBdPhoneToE164(mobileLocal)).toBe(mobileE164)
    expect(normalizeBdPhoneToE164(mobileWithoutTrunk)).toBe(mobileE164)
  })

  it('keeps already-normalized international numbers', () => {
    expect(normalizeBdPhoneToE164(iptE164)).toBe(iptE164)
    expect(normalizeBdPhoneToE164(`00${iptE164.slice(1)}`)).toBe(iptE164)
    expect(normalizeBdPhoneToE164(usE164)).toBe(usE164)
  })

  it('validates E.164 shape', () => {
    expect(isE164(iptE164)).toBe(true)
    expect(isE164(`+${iptLocal}`)).toBe(true)
    expect(isE164(iptLocal)).toBe(false)
  })
})
