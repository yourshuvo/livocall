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

const Body = z.object({
  type: z.enum(['url', 'website', 'pdf', 'docx', 'text']),
  ref: z.string().min(1).max(2000),
  storage: z
    .object({
      provider: z.enum(['local', 's3', 'external', 'inline']).optional(),
      key: z.string().optional(),
    })
    .optional(),
})

const PatchBody = z.object({
  originalRef: z.string().min(1).max(2000),
  ref: z.string().min(1).max(2000),
})

export const POST = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  const body = Body.parse(await req.json().catch(() => ({})))
  const extraction = await extractKnowledgeSource(body.type, body.ref)
  await connectMongo()
  const updated = await KnowledgeBase.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    {
      $push: {
        sources: {
          ...body,
          title: extraction.title ?? '',
          storage: body.storage ?? {
            provider: body.type === 'text' ? 'inline' : body.type === 'url' || body.type === 'website' ? 'external' : 'local',
            key: '',
          },
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

export const DELETE = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  const url = new URL(req.url)
  const ref = url.searchParams.get('ref')
  if (!ref) return apiError('invalid_input', 'pass ?ref=… to identify the source')
  await connectMongo()
  const updated = await KnowledgeBase.findOneAndUpdate(
    { _id: oid, orgId: s.orgId },
    { $pull: { sources: { ref } } },
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

export const PATCH = withErrors(async (req: Request, ctx: { params: { id: string } }) => {
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(ctx.params.id)
  if (!oid) return apiError('invalid_input')
  const body = PatchBody.parse(await req.json().catch(() => ({})))
  await connectMongo()
  const kb = await KnowledgeBase.findOne({ _id: oid, orgId: s.orgId })
  if (!kb) return apiError('not_found')
  const source = kb.sources.find((src) => src.ref === body.originalRef)
  if (!source) return apiError('not_found', 'source not found')
  const extraction = await extractKnowledgeSource(source.type, body.ref)
  source.ref = body.ref
  source.title = extraction.title ?? source.title ?? ''
  source.storage = source.storage ?? {
    provider: source.type === 'text' ? 'inline' : source.type === 'url' || source.type === 'website' ? 'external' : 'local',
    key: '',
  }
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
