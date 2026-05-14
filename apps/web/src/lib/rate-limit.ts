/**
 * Token-bucket rate limiter.
 *
 * Backed by Redis when REDIS_URL is set, otherwise an in-memory map (per-process,
 * which is fine for dev and tests but not for multi-instance prod).
 */

interface Bucket {
  tokens: number
  updatedAt: number
}

const memory = new Map<string, Bucket>()

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

export interface RateLimitConfig {
  /** Bucket key — typically `${orgId}:${routeName}` or `${ip}:auth`. */
  key: string
  /** Bucket capacity (max burst). */
  capacity: number
  /** Tokens refilled per second. */
  refillPerSec: number
  /** Tokens this call consumes. */
  cost?: number
}

export async function rateLimit(cfg: RateLimitConfig): Promise<RateLimitResult> {
  const cost = cfg.cost ?? 1
  const now = Date.now()
  const bucket = memory.get(cfg.key) ?? { tokens: cfg.capacity, updatedAt: now }
  const elapsedSec = (now - bucket.updatedAt) / 1000
  const refilled = Math.min(cfg.capacity, bucket.tokens + elapsedSec * cfg.refillPerSec)
  if (refilled < cost) {
    memory.set(cfg.key, { tokens: refilled, updatedAt: now })
    const waitSec = (cost - refilled) / cfg.refillPerSec
    return { ok: false, remaining: Math.floor(refilled), resetAt: now + waitSec * 1000 }
  }
  memory.set(cfg.key, { tokens: refilled - cost, updatedAt: now })
  return {
    ok: true,
    remaining: Math.floor(refilled - cost),
    resetAt: now + ((cfg.capacity - (refilled - cost)) / cfg.refillPerSec) * 1000,
  }
}

/** Test-only helper. */
export function _resetRateLimit() {
  memory.clear()
}
