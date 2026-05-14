import { describe, expect, it } from 'vitest'
import { decryptSipPassword, encryptSipPassword, slugifySipProvider } from './sip'

describe('sip helpers', () => {
  it('slugifies custom provider names', () => {
    expect(slugifySipProvider('My SIP Carrier BD')).toBe('sip_my_sip_carrier_bd')
    expect(slugifySipProvider('  ###  ')).toBe('sip_custom')
  })

  it('round-trips encrypted SIP passwords', () => {
    const encrypted = encryptSipPassword('secret-password')
    expect(encrypted).not.toBe('secret-password')
    expect(decryptSipPassword(encrypted)).toBe('secret-password')
  })
})
