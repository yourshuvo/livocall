import bcrypt from 'bcryptjs'
import { connectMongo } from '@/lib/db'
import { ApiKey, type ApiKeyDoc } from '@/models/ApiKey'

const PREFIX = 'lvo_'

/**
 * Authenticates a public-API request by its `Authorization: Bearer lvo_…` header.
 * Returns the matching ApiKey doc on success, null otherwise. Updates lastUsedAt
 * asynchronously (fire-and-forget) so happy-path latency stays tight.
 */
export async function authenticateApiKey(req: Request): Promise<ApiKeyDoc | null> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!auth) return null
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (!m) return null
  const token = m[1].trim()
  if (!token.startsWith(PREFIX)) return null
  const prefix = token.slice(0, 12)

  await connectMongo()
  // Use the prefix as a coarse-grained index lookup, then bcrypt-compare. Many
  // candidates is fine — bcrypt-compare is only needed for the matching prefix.
  const candidates = await ApiKey.find({ prefix, revokedAt: null }).limit(8)
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(token, c.hash)) {
      ApiKey.updateOne({ _id: c._id }, { $set: { lastUsedAt: new Date() } })
        .exec()
        .catch(() => {})
      return c
    }
  }
  return null
}

export function hasScope(key: ApiKeyDoc, scope: string): boolean {
  return key.scopes.includes(scope) || key.scopes.includes('*')
}
