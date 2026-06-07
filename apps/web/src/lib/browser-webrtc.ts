import { createHmac } from 'node:crypto'

export type BrowserIceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

export function browserWebrtcUrl() {
  const direct = process.env.VOICE_BROWSER_WEBRTC_URL || ''
  const serviceUrl = process.env.NEXT_PUBLIC_VOICE_SERVICE_URL || process.env.VOICE_SERVICE_URL || ''
  const value = direct || (serviceUrl ? `${serviceUrl.replace(/\/+$/, '')}/webrtc/browser-offer` : '')
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (!/^https?:$/.test(url.protocol)) return null
    return url
  } catch {
    return null
  }
}

export function browserWebrtcPrewarmUrl() {
  const direct = process.env.VOICE_BROWSER_WEBRTC_PREWARM_URL || ''
  const serviceUrl = process.env.NEXT_PUBLIC_VOICE_SERVICE_URL || process.env.VOICE_SERVICE_URL || ''
  const value = direct || (serviceUrl ? `${serviceUrl.replace(/\/+$/, '')}/webrtc/browser-prewarm` : '')
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (!/^https?:$/.test(url.protocol)) return null
    return url
  } catch {
    return null
  }
}

export function browserIceServers(): BrowserIceServer[] {
  const servers: BrowserIceServer[] = (
    process.env.WEBRTC_ICE_SERVERS || 'stun:stun.l.google.com:19302'
  )
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({ urls: url }))
  const turnUrl = process.env.WEBRTC_TURN_URL || ''
  if (turnUrl) {
    const turn: BrowserIceServer = { urls: turnUrl }
    if (process.env.WEBRTC_TURN_USERNAME) turn.username = process.env.WEBRTC_TURN_USERNAME
    if (process.env.WEBRTC_TURN_CREDENTIAL) turn.credential = process.env.WEBRTC_TURN_CREDENTIAL
    servers.push(turn)
  }
  return servers
}

export function browserWsBaseUrl() {
  const direct =
    process.env.VOICE_BROWSER_WS_URL ||
    process.env.NEXT_PUBLIC_VOICE_WS_URL ||
    process.env.VOICE_WS_PUBLIC_URL ||
    ''
  if (direct) return normalizeWsUrl(direct)

  const serviceUrl = process.env.NEXT_PUBLIC_VOICE_SERVICE_URL || process.env.VOICE_SERVICE_URL || ''
  if (!serviceUrl) return ''
  return normalizeWsUrl(`${serviceUrl.replace(/\/+$/, '')}/ws/audio`)
}

export function signWsAuth(callId: string) {
  const secret = process.env.VOICE_WS_SHARED_SECRET || ''
  if (!secret) return ''
  const ttl = Number(process.env.VOICE_WS_AUTH_TTL_SECONDS || 3600)
  const expires = Math.floor(Date.now() / 1000) + Math.max(60, ttl)
  const signature = createHmac('sha256', secret)
    .update(`${callId}|${expires}`)
    .digest('base64url')
  return `${expires}.${signature}`
}

function normalizeWsUrl(value: string) {
  const normalized = value.trim().replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')
  if (!normalized) return ''
  try {
    const url = new URL(normalized)
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/ws/audio'
    } else if (url.pathname.endsWith('/ws/audio-pcmu')) {
      url.pathname = url.pathname.replace(/\/ws\/audio-pcmu$/, '/ws/audio')
    }
    return url.toString()
  } catch {
    return ''
  }
}
