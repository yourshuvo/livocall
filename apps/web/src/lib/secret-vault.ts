import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { Types } from 'mongoose'
import { Secret } from '@/models/Secret'

function key(): Buffer {
  return createHash('sha256')
    .update(process.env.SECRETS_VAULT_KEY || process.env.SIP_CREDENTIAL_SECRET || 'livocall-dev')
    .digest()
}

export function encryptSecretValue(value: string): string {
  if (!value) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptSecretValue(value: string): string {
  if (!value) return ''
  const [version, ivB64, tagB64, ciphertextB64] = value.split(':')
  if (version !== 'v1' || !ivB64 || !tagB64 || !ciphertextB64) return value
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export function secretFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export async function resolveSecretValue(orgId: string | Types.ObjectId, secretId: string | Types.ObjectId) {
  const secret = await Secret.findOne({ _id: secretId, orgId, revokedAt: { $exists: false } }).select('+ciphertext')
  if (!secret) return null
  secret.lastUsedAt = new Date()
  await secret.save()
  return decryptSecretValue(secret.ciphertext)
}

export async function resolveAgentTools<T extends {
  secretId?: unknown
  authValue?: string
  authHeader?: string
  headers?: Record<string, string>
}>(orgId: string | Types.ObjectId, tools: T[] = []) {
  const resolved = []
  for (const tool of tools) {
    const authValue = tool.secretId ? await resolveSecretValue(orgId, String(tool.secretId)) : tool.authValue || ''
    const headers = { ...(tool.headers || {}) }
    if (tool.authHeader && authValue) headers[tool.authHeader] = authValue
    resolved.push({
      ...tool,
      headers,
      authValue: authValue || '',
      secretResolved: Boolean(tool.secretId && authValue),
    })
  }
  return resolved
}
