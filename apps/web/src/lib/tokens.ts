import { createHash, randomBytes } from 'crypto'

/** Generate a cryptographically-random URL-safe token. */
export function generateToken(byteLen = 32): string {
  return randomBytes(byteLen).toString('base64url')
}

/** Hash a token for storage. We only ever persist the hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
