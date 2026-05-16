export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { isResponse, objectIdOr400, requireDashboardSession } from '@/lib/api-helpers'
import { apiError, withErrors } from '@/lib/errors'
import { Campaign } from '@/models/Campaign'
import { CampaignAttempt } from '@/models/CampaignAttempt'
import { Contact } from '@/models/Contact'

export const GET = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const s = await requireDashboardSession()
  if (isResponse(s)) return s
  const oid = objectIdOr400(id)
  if (!oid) return apiError('invalid_input')
  await connectMongo()
  const campaign = await Campaign.findOne({ _id: oid, orgId: s.orgId }).lean()
  if (!campaign) return apiError('not_found')
  const attempts = await CampaignAttempt.find({ campaignId: oid }).sort({ updatedAt: -1 }).limit(500).lean()
  const contacts = await Contact.find({ _id: { $in: attempts.map((a) => a.contactId) }, orgId: s.orgId }).lean()
  const byContact = new Map(contacts.map((c) => [String(c._id), c]))
  return NextResponse.json({
    attempts: attempts.map((a) => {
      const contact = byContact.get(String(a.contactId))
      return {
        id: String(a._id),
        contactId: String(a.contactId),
        contactName: contact?.name ?? '',
        e164: contact?.e164 ?? '',
        callId: a.callId ? String(a.callId) : null,
        status: a.status,
        attempts: a.attempts,
        leadScore: a.leadScore ?? 0,
        lastOutcome: a.lastOutcome ?? '',
        lastReason: a.lastReason ?? '',
        nextRetryAt: a.nextRetryAt ? new Date(a.nextRetryAt).toISOString() : null,
        completedAt: a.completedAt ? new Date(a.completedAt).toISOString() : null,
        updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : null,
      }
    }),
  })
})
