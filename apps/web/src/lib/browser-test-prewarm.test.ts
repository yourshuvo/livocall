import { describe, expect, it } from 'vitest'

import { shouldPrewarmBrowserVoice } from './browser-test-prewarm'

describe('browser voice prewarm', () => {
  it('prewarms both WebRTC voice tiers before the user starts a test', () => {
    expect(shouldPrewarmBrowserVoice('gemini_live', false)).toBe(true)
    expect(shouldPrewarmBrowserVoice('pipeline', false)).toBe(true)
  })

  it('does not prewarm unsupported tiers or duplicate prewarm calls', () => {
    expect(shouldPrewarmBrowserVoice('grok_voice', false)).toBe(false)
    expect(shouldPrewarmBrowserVoice('dtmf', false)).toBe(false)
    expect(shouldPrewarmBrowserVoice('pipeline', true)).toBe(false)
  })
})
