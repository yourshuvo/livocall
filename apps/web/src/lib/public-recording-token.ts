import { createHmac, timingSafeEqual } from 'node:crypto'

export function signPublicRecordingToken(callId: string, secret: string, ttlSeconds: number) {
  const normalizedSecret = secret.trim()
  if (!callId || !normalizedSecret) return ''
  const ttl = Math.max(60, Math.floor(ttlSeconds || 0))
  const expires = Math.floor(Date.now() / 1000) + ttl
  const signature = createHmac('sha256', normalizedSecret)
    .update(publicRecordingTokenPayload(callId, expires))
    .digest('base64url')
  return `${expires}.${signature}`
}

export function verifyPublicRecordingToken(callId: string, token: string, secret: string) {
  const normalizedSecret = secret.trim()
  if (!callId || !token || !normalizedSecret) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const expires = Number(parts[0])
  const signature = parts[1]
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false
  if (!signature) return false

  const expected = createHmac('sha256', normalizedSecret)
    .update(publicRecordingTokenPayload(callId, expires))
    .digest('base64url')

  try {
    const actualBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  } catch {
    return false
  }
}

function publicRecordingTokenPayload(callId: string, expires: number) {
  return `public-webcall-recording|${callId}|${expires}`
}
