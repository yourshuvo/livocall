export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { connectMongo } from '@/lib/db'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { putObject } from '@/lib/object-storage'
import {
  extensionForRecordingContentType,
  isAllowedRecordingContentType,
} from '@/lib/recording-content-type'
import { Call } from '@/models/Call'

const MAX_RECORDING_BYTES = 80 * 1024 * 1024

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

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const session = await requireDashboardSession()
  if (isResponse(session)) return session
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input', 'invalid call id')

  await connectMongo()
  const call = await Call.findOne({ _id: oid, orgId: session.orgId })
  if (!call) return apiError('not_found', 'call not found')
  const source = String((call.metadata as Record<string, unknown> | undefined)?.source || '')
  if (source !== 'dashboard-browser-test') {
    return apiError('forbidden', 'recording upload is only allowed for dashboard browser tests')
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!isUploadedFile(file)) return apiError('invalid_input', 'file is required')
  if (file.size <= 0) return apiError('invalid_input', 'recording is empty')
  if (file.size > MAX_RECORDING_BYTES) {
    return apiError('invalid_input', 'recording must be under 80MB')
  }
  const contentType = file.type || 'audio/webm'
  if (!isAllowedRecordingContentType(contentType)) {
    return apiError('invalid_input', 'upload an audio recording')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const ext = extensionForRecordingContentType(contentType)
  const key = `recordings/${String(session.orgId)}/${String(call._id)}-${Date.now()}-${randomUUID()}.${ext}`
  const stored = await putObject(key, bytes, contentType)
  call.audioUrl = stored.url
  call.metadata = {
    ...(call.metadata && typeof call.metadata === 'object' ? call.metadata : {}),
    browserRecording: {
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
