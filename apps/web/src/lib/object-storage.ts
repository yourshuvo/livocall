import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const LOCAL_ROOT = 'uploads'

export interface StoredObject {
  provider: 'local' | 's3'
  key: string
  url: string
}

function bucket(): string {
  return process.env.FILE_STORAGE_BUCKET || process.env.S3_BUCKET || ''
}

function endpoint(): string | undefined {
  return process.env.FILE_STORAGE_ENDPOINT || process.env.S3_ENDPOINT || undefined
}

function region(): string {
  return process.env.FILE_STORAGE_REGION || process.env.AWS_REGION || 'auto'
}

function publicBaseUrl(): string {
  return (process.env.FILE_STORAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
}

function isS3Configured(): boolean {
  return Boolean(bucket())
}

export function objectStorageIsRemote(): boolean {
  return isS3Configured()
}

export function objectKeyFromUrl(urlOrKey: string): string {
  if (urlOrKey.startsWith('s3://')) return urlOrKey.split('/').slice(3).join('/')
  if (urlOrKey.startsWith('file://')) {
    return path.relative(path.join(process.cwd(), LOCAL_ROOT), urlOrKey.slice('file://'.length))
  }

  const base = publicBaseUrl()
  if (base && urlOrKey.startsWith(`${base}/`)) {
    return decodeURIComponent(urlOrKey.slice(base.length + 1)).replace(/^\/+/, '')
  }

  try {
    const url = new URL(urlOrKey)
    const endpointUrl = endpoint()
    if (endpointUrl) {
      const endpointHost = new URL(endpointUrl).host
      if (url.host === endpointHost) {
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts[0] === bucket()) return decodeURIComponent(parts.slice(1).join('/'))
      }
    }
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  } catch {
    return urlOrKey.replace(/^\/+/, '')
  }
}

function client(): S3Client {
  const accessKeyId = process.env.FILE_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.FILE_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
  return new S3Client({
    region: region(),
    endpoint: endpoint(),
    forcePathStyle: process.env.FILE_STORAGE_FORCE_PATH_STYLE === 'true',
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
  })
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
  if (!isS3Configured()) {
    const target = path.join(process.cwd(), LOCAL_ROOT, key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body)
    return { provider: 'local', key, url: `file://${target}` }
  }

  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }),
  )
  const base = publicBaseUrl()
  return {
    provider: 's3',
    key,
    url: base ? `${base}/${key}` : `s3://${bucket()}/${key}`,
  }
}

export async function getObjectBuffer(urlOrKey: string): Promise<Buffer> {
  if (urlOrKey.startsWith('file://')) {
    return readFile(urlOrKey.slice('file://'.length))
  }

  const key = objectKeyFromUrl(urlOrKey)
  if (!isS3Configured()) {
    return readFile(path.join(process.cwd(), LOCAL_ROOT, key))
  }

  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  if (!res.Body) return Buffer.alloc(0)
  return Buffer.from(await res.Body.transformToByteArray())
}

export async function signedReadUrl(urlOrKey: string, expiresIn = 900): Promise<string> {
  if (urlOrKey.startsWith('file://')) return urlOrKey
  const key = objectKeyFromUrl(urlOrKey)
  if (!isS3Configured()) return `file://${path.join(process.cwd(), LOCAL_ROOT, key)}`
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn })
}
