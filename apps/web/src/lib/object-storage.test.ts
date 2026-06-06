import { afterEach, describe, expect, it } from 'vitest'
import { objectKeyFromUrl } from './object-storage'

const ENV_KEYS = ['FILE_STORAGE_BUCKET', 'FILE_STORAGE_ENDPOINT', 'FILE_STORAGE_PUBLIC_BASE_URL']
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
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
})
