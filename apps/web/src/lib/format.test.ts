import { describe, expect, it } from 'vitest'
import { browserTestCallLabel, isBrowserTestCall } from './format'

describe('browser test call labels', () => {
  it('labels public landing Webcalls separately from dashboard tests', () => {
    expect(browserTestCallLabel({ source: 'dashboard-browser-test' })).toBe('Browser test')
    expect(browserTestCallLabel({ source: 'landing-webcall' })).toBe('Webcall demo')
    expect(isBrowserTestCall({ source: 'landing-webcall' })).toBe(true)
  })
})
