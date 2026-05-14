import crypto from 'node:crypto'

/**
 * Stripe-style signature: `t=<unix>,v1=<hex>` where v1 = HMAC-SHA256(secret, `${t}.${body}`).
 * Receivers should reject signatures older than ~5 minutes to mitigate replay.
 */
export function signWebhook(secret: string, body: string, now: number = Date.now()): string {
  const t = Math.floor(now / 1000)
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${body}`)
    .digest('hex')
  return `t=${t},v1=${mac}`
}

export function verifyWebhook(
  secret: string,
  body: string,
  header: string,
  toleranceSec = 300,
  now: number = Date.now(),
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k.trim(), (v ?? '').trim()]
    }),
  )
  const t = Number(parts.t)
  const v1 = parts.v1
  if (!t || !v1) return false
  if (Math.abs(Math.floor(now / 1000) - t) > toleranceSec) return false
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/** Random secret for new webhooks / API keys. */
export function randomToken(prefix: string, bytes = 24): string {
  return `${prefix}${crypto.randomBytes(bytes).toString('base64url')}`
}
