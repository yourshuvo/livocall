export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectMongo } from '@/lib/db'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import {
  isResponse,
  objectIdOr400,
  requireDashboardSession,
} from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { kbToJson } from '@/lib/serialize'
import { extractKnowledgeSource } from '@/lib/knowledge-ingest'
import { calculateKnowledgeQuality } from '@/lib/knowledge-quality'

const SourceType = z.enum(['url', 'website', 'pdf', 'docx', 'text'])
const SourceRef = z.string().min(1).max(40000)
const StorageProvider = z.enum(['local', 's3', 'external', 'inline'])
const Storage = z
  .object({
    provider: StorageProvider.optional(),
    key: z.string().optional(),
  })
  .optional()

type SourceTypeValue = z.infer<typeof SourceType>
type StorageProviderValue = z.infer<typeof StorageProvider>
type SourceStorage = { provider?: StorageProviderValue; key: string }
type IncomingStorage =
  | {
      provider?: StorageProviderValue | null
      key?: string | null
    }
  | null
  | undefined

const Body = z.object({
  type: SourceType,
  ref: SourceRef,
  storage: Storage,
})

const PatchBody = z.object({
  originalRef: SourceRef,
  ref: SourceRef.optional(),
  content: SourceRef.optional(),
})
  .refine((body) => body.ref !== undefined || body.content !== undefined, {
    message: 'pass ref or content to update the source',
  })

const DeleteBody = z.object({
  ref: SourceRef,
})

function defaultStorageFor(type: SourceTypeValue): SourceStorage {
  return {
    provider: type === 'text' ? 'inline' : type === 'url' || type === 'website' ? 'external' : 'local',
    key: '',
  }
}

function normalizeStorageFor(type: SourceTypeValue, storage: IncomingStorage): SourceStorage {
  const fallback = defaultStorageFor(type)
  return {
    provider: storage?.provider ?? fallback.provider,
    key: storage?.key ?? fallback.key,
  }
}

export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  const body = Body.parse(await req.json().catch(() => ({})))
  const storage = normalizeStorageFor(body.type, body.storage)
  const extraction = await extractKnowledgeSource(body.type, body.ref, storage)
  await connectMongo()
  const updated = await KnowledgeBase.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    {
      $push: {
        sources: {
          ...body,
          title: extraction.title ?? '',
          content: extraction.text,
          storage,
          ingestion: {
            status: extraction.status,
            chunkCount: extraction.chunkCount,
            extractedChars: extraction.text.length,
            error: extraction.error ?? '',
            extractedAt: new Date(),
          },
          addedAt: new Date(),
        },
      },
    },
    { new: true },
  ).lean()
  if (!updated) return apiError('not_found')
  await KnowledgeBase.updateOne(
    { _id: oid, orgId: s.orgId },
    { $set: { quality: calculateKnowledgeQuality(updated) } },
  )
  updated.quality = calculateKnowledgeQuality(updated)
  return NextResponse.json(kbToJson(updated))
})

export const DELETE = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  const url = new URL(req.url)
  const queryRef = url.searchParams.get('ref')
  let bodyRef: string | undefined
  if (queryRef === null) {
    const parsedBody = DeleteBody.safeParse(await req.json().catch(() => ({})))
    if (parsedBody.success) bodyRef = parsedBody.data.ref
  }
  const parsedRef = SourceRef.safeParse(queryRef ?? bodyRef)
  if (!parsedRef.success) return apiError('invalid_input', 'pass ref to identify the source')
  await connectMongo()
  const updated = await KnowledgeBase.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $pull: { sources: { ref: parsedRef.data } } },
    { new: true },
  ).lean()
  if (!updated) return apiError('not_found')
  await KnowledgeBase.updateOne(
    { _id: oid, orgId: s.orgId },
    { $set: { quality: calculateKnowledgeQuality(updated) } },
  )
  updated.quality = calculateKnowledgeQuality(updated)
  return NextResponse.json(kbToJson(updated))
})

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  const body = PatchBody.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const kb = await KnowledgeBase.findOne({ _id: oid, orgId: s.orgId })
  if (!kb) return apiError('not_found')
  const source = kb.sources.find((src) => src.ref === body.originalRef)
  if (!source) return apiError('not_found', 'source not found')
  const sourceType = SourceType.parse(source.type)
  const storage = normalizeStorageFor(sourceType, source.storage)
  const isContentEdit = body.content !== undefined
  const nextText = body.content ?? body.ref ?? ''
  const extraction = isContentEdit
    ? await extractKnowledgeSource('text', nextText, { provider: 'inline', key: '' })
    : await extractKnowledgeSource(sourceType, nextText, storage)
  if (!isContentEdit || (sourceType === 'text' && storage.provider === 'inline')) {
    source.ref = nextText
  }
  source.content = extraction.text
  source.title = extraction.title ?? source.title ?? ''
  source.storage = storage
  source.ingestion = {
    status: extraction.status,
    chunkCount: extraction.chunkCount,
    extractedChars: extraction.text.length,
    error: extraction.error ?? '',
    extractedAt: new Date(),
  }
  kb.quality = calculateKnowledgeQuality(kb.toObject())
  await kb.save()
  return NextResponse.json(kbToJson(kb.toObject()))
})
