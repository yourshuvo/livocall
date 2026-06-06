import { afterEach, describe, expect, it, vi } from 'vitest'
import { objectKeyFromUrl, putObject } from './object-storage'

const sendMock = vi.fn()
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  return {
    ...actual,
    S3Client: vi.fn(() => ({ send: sendMock })),
  }
})

const ENV_KEYS = [
  'FILE_STORAGE_BUCKET',
  'FILE_STORAGE_ENDPOINT',
  'FILE_STORAGE_PUBLIC_BASE_URL',
  'FILE_STORAGE_ACCESS_KEY_ID',
  'FILE_STORAGE_SECRET_ACCESS_KEY',
]
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  sendMock.mockReset()
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('objectKeyFromUrl', () => {
  it('extracts keys from DigitalOcean Spaces public URLs', () => {
    process.env.FILE_STORAGE_BUCKET = 'shuvo'
    process.env.FILE_STORAGE_ENDPOINT = 'https://sgp1.digitaloceanspaces.com'
    process.env.FILE_STORAGE_PUBLIC_BASE_URL = 'https://shuvo.sgp1.digitaloceanspaces.com'

    expect(
      objectKeyFromUrl('https://shuvo.sgp1.digitaloceanspaces.com/recordings/call-123.wav'),
    ).toBe('recordings/call-123.wav')
    expect(
      objectKeyFromUrl('https://sgp1.digitaloceanspaces.com/shuvo/knowledge/source%201.pdf'),
    ).toBe('knowledge/source 1.pdf')
  })

  it('marks remote uploads public when returning public URLs', async () => {
    process.env.FILE_STORAGE_BUCKET = 'shuvo'
    process.env.FILE_STORAGE_ENDPOINT = 'https://sgp1.digitaloceanspaces.com'
    process.env.FILE_STORAGE_PUBLIC_BASE_URL = 'https://shuvo.sgp1.digitaloceanspaces.com'
    sendMock.mockResolvedValueOnce({})

    const stored = await putObject('knowledge/test.txt', Buffer.from('hello'), 'text/plain')

    expect(stored.url).toBe('https://shuvo.sgp1.digitaloceanspaces.com/knowledge/test.txt')
    const command = sendMock.mock.calls[0]?.[0]
    expect(command.input).toMatchObject({
      Bucket: 'shuvo',
      Key: 'knowledge/test.txt',
      ContentType: 'text/plain',
      ACL: 'public-read',
    })
  })
})
