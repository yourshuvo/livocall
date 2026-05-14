import { authenticateApiKey, hasScope } from '@/lib/auth/api-key'
import { apiError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'

export interface V1Auth {
  orgId: string
  apiKeyId: string
  scopes: string[]
}

/**
 * Authenticate a public API request and apply per-key rate-limit. Returns a
 * Response with the right status if authentication or rate-limit fails;
 * returns a {@link V1Auth} otherwise.
 */
export async function authV1(req: Request, requiredScope: string): Promise<V1Auth | Response> {
  const key = await authenticateApiKey(req)
  if (!key) return apiError('unauthenticated', 'invalid or missing API key')
  if (!hasScope(key, requiredScope)) {
    return apiError('forbidden', `API key is missing required scope: ${requiredScope}`)
  }
  const rl = await rateLimit({
    key: `v1:${String(key._id)}`,
    capacity: 60,
    refillPerSec: 5,
  })
  if (!rl.ok) return apiError('rate_limited')
  return { orgId: String(key.orgId), apiKeyId: String(key._id), scopes: key.scopes }
}

export function isResponse(v: unknown): v is Response {
  return typeof v === 'object' && v !== null && 'status' in v && 'headers' in v
}
