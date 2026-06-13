import { afterEach, describe, expect, it } from 'vitest'

import { browserWebrtcPrewarmUrl, browserWebrtcUrl, signWsAuth } from './browser-webrtc'

const ORIGINAL_ENV = { ...process.env }

describe('browser WebRTC public URLs', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('does not expose server-only Docker voice service URLs to the browser', () => {
    process.env.VOICE_BROWSER_WEBRTC_URL = ''
    process.env.VOICE_BROWSER_WEBRTC_PREWARM_URL = ''
    process.env.NEXT_PUBLIC_VOICE_SERVICE_URL = ''
    process.env.VOICE_SERVICE_URL = 'http://voice:8084'

    expect(browserWebrtcUrl()).toBeNull()
    expect(browserWebrtcPrewarmUrl()).toBeNull()
  })

  it('uses explicit browser-public voice URLs when configured', () => {
    process.env.VOICE_BROWSER_WEBRTC_URL = 'https://voice.example.com/webrtc/browser-offer'
    process.env.VOICE_BROWSER_WEBRTC_PREWARM_URL = 'https://voice.example.com/webrtc/browser-prewarm'
    process.env.VOICE_SERVICE_URL = 'http://voice:8084'

    expect(browserWebrtcUrl()?.toString()).toBe('https://voice.example.com/webrtc/browser-offer')
    expect(browserWebrtcPrewarmUrl()?.toString()).toBe(
      'https://voice.example.com/webrtc/browser-prewarm',
    )
  })

  it('derives the prewarm URL from the configured browser offer URL', () => {
    process.env.VOICE_BROWSER_WEBRTC_URL = 'https://voice.example.com/webrtc/browser-offer'
    process.env.VOICE_BROWSER_WEBRTC_PREWARM_URL = ''
    process.env.NEXT_PUBLIC_VOICE_SERVICE_URL = ''
    process.env.VOICE_SERVICE_URL = 'http://voice:8084'

    expect(browserWebrtcUrl()?.toString()).toBe('https://voice.example.com/webrtc/browser-offer')
    expect(browserWebrtcPrewarmUrl()?.toString()).toBe(
      'https://voice.example.com/webrtc/browser-prewarm',
    )
  })
})

describe('browser WebRTC auth signing', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('signs browser calls when the web service receives VOICE_WS_SHARED_SECRET', () => {
    process.env.VOICE_WS_SHARED_SECRET = 'test-secret'
    process.env.VOICE_WS_AUTH_TTL_SECONDS = '3600'

    expect(signWsAuth('64b64b64b64b64b64b64b64b')).toMatch(/^\d+\.[A-Za-z0-9_-]+$/)
  })
})
