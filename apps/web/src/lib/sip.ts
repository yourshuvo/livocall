import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

export function slugifySipProvider(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return slug ? `sip_${slug}` : 'sip_custom'
}

function encryptionKey(): Buffer {
  const source =
    process.env.SIP_CREDENTIAL_SECRET ||
    process.env.SESSION_SECRET ||
    'livocall-dev'
  return createHash('sha256').update(source).digest()
}

export function encryptSipPassword(password: string): string {
  if (!password) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptSipPassword(value: string): string {
  if (!value) return ''
  const [version, ivB64, tagB64, ciphertextB64] = value.split(':')
  if (version !== 'v1' || !ivB64 || !tagB64 || !ciphertextB64) return value
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
