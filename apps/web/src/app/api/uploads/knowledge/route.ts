export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isResponse, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { putObject, signedReadUrl } from '@/lib/object-storage'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

type UploadedFile = {
  name: string
  size: number
  type: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'knowledge-file'
}

function isUploadedFile(value: unknown): value is UploadedFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'size' in value &&
    'type' in value &&
    typeof value.arrayBuffer === 'function'
  )
}

export const POST = withErrors(async (req: Request) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const form = await req.formData()
  const file = form.get('file')
  if (!isUploadedFile(file)) return apiError('invalid_input', 'file is required')
  if (file.size > MAX_BYTES) return apiError('invalid_input', 'file must be under 8MB')
  if (file.type && !ALLOWED.has(file.type)) {
    return apiError('invalid_input', 'upload a PDF, TXT, Markdown, or DOCX file')
  }
  const name = `${Date.now()}-${randomUUID()}-${safeName(file.name)}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const key = `knowledge/${String(s.orgId)}/${name}`
  const stored = await putObject(key, bytes, file.type || 'application/octet-stream')
  const kind =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? 'docx'
        : 'text'
  return NextResponse.json({
    type: kind,
    ref: stored.url,
    storage: { provider: stored.provider, key: stored.key },
    signedUrl: await signedReadUrl(stored.url),
    name: file.name,
    size: file.size,
  })
})
