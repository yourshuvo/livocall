export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { connectMongo } from '@/lib/db'
import { objectIdOr400 } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { putObject } from '@/lib/object-storage'
import { verifyPublicRecordingToken } from '@/lib/public-recording-token'
import { Call } from '@/models/Call'

const MAX_RECORDING_BYTES = 80 * 1024 * 1024
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
])

type UploadedFile = {
  name: string
  size: number
  type: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

function isUploadedFile(value: unknown): value is UploadedFile {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string' &&
    typeof candidate.arrayBuffer === 'function'
  )
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes('mp4')) return 'm4a'
  if (contentType.includes('mpeg')) return 'mp3'
  if (contentType.includes('ogg')) return 'ogg'
  if (contentType.includes('wav')) return 'wav'
  return 'webm'
}

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input', 'invalid call id')

  const token = req.headers.get('x-recording-token') || new URL(req.url).searchParams.get('token') || ''
  if (!verifyPublicRecordingToken(id, token, process.env.VOICE_WS_SHARED_SECRET || '')) {
    return apiError('forbidden', 'invalid recording token')
  }

  await connectMongo()
  const call = await Call.findOne({ _id: oid })
  if (!call) return apiError('not_found', 'call not found')
  const metadata = call.metadata && typeof call.metadata === 'object' ? call.metadata : {}
  if (String((metadata as Record<string, unknown>).source || '') !== 'landing-webcall') {
    return apiError('forbidden', 'recording upload is only allowed for public Webcall sessions')
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!isUploadedFile(file)) return apiError('invalid_input', 'file is required')
  if (file.size <= 0) return apiError('invalid_input', 'recording is empty')
  if (file.size > MAX_RECORDING_BYTES) {
    return apiError('invalid_input', 'recording must be under 80MB')
  }
  const contentType = file.type || 'audio/webm'
  if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
    return apiError('invalid_input', 'upload an audio recording')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const ext = extensionForContentType(contentType)
  const key = `recordings/${String(call.orgId)}/${String(call._id)}-${Date.now()}-${randomUUID()}.${ext}`
  const stored = await putObject(key, bytes, contentType)
  call.audioUrl = stored.url
  call.metadata = {
    ...metadata,
    publicWebcallRecording: {
      provider: stored.provider,
      key: stored.key,
      contentType,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    },
  }
  await call.save()

  return NextResponse.json({ audioUrl: stored.url, storage: { provider: stored.provider, key: stored.key } })
})
