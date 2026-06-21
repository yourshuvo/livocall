export const dynamic = 'force-dynamic'
/**
 * Internal endpoint hit by the Python voice service to record call events
 * (started, ended, transcript chunks, billing). Authenticated via a shared
 * secret in `VOICE_SHARED_SECRET` (must match the `Authorization: Bearer …`
 * header set by the voice service). Never exposed to the public internet.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Types } from 'mongoose'
import { connectMongo } from '@/lib/db'
import { Call, type CallDoc } from '@/models/Call'
import { Agent } from '@/models/Agent'
import { apiError, withErrors } from '@/lib/errors'
import { postLedger } from '@/lib/billing'
import { emitDirectWebhook, emitWebhook } from '@/lib/webhooks'
import { enforceTranscriptCompliance } from '@/lib/compliance'
import { analyzeBusinessOutcome } from '@/lib/business-outcome-analyzer'
import { campaignOutcomeStatus } from '@/lib/business-outcomes'
import {
  completeMissedCallbackAttempt,
  enqueueMissedCallbackForCall,
} from '@/lib/missed-callbacks'
import { CampaignAttempt } from '@/models/CampaignAttempt'
import { Campaign } from '@/models/Campaign'
import {
  executeWordPressDtmfActions,
  recordDtmfActionResults,
} from '@/lib/wordpress-integration'

const SHARED_SECRET = process.env.VOICE_SHARED_SECRET || ''

const StartedBody = z.object({
  type: z.literal('call.started'),
  callId: z.string().optional(),
  agentId: z.string(),
  orgId: z.string(),
  edgeUuid: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  fromE164: z.string(),
  toE164: z.string(),
  tier: z.enum(['gemini_live', 'grok_voice', 'pipeline', 'dtmf']),
  startedAt: z.string().datetime(),
  metadata: z.record(z.string()).optional(),
})

const TranscriptBody = z.object({
  type: z.literal('call.transcript'),
  callId: z.string(),
  role: z.enum(['user', 'agent', 'system']),
  text: z.string(),
  at: z.string().datetime(),
})

const DtmfBody = z.object({
  type: z.literal('call.dtmf'),
  callId: z.string(),
  digit: z.string().min(1).max(8),
  menuItem: z
    .object({
      key: z.string().optional(),
      label: z.string().optional(),
      action: z.string().optional(),
      actionType: z.string().optional(),
      actionConfig: z.record(z.unknown()).optional(),
    })
    .optional()
    .nullable(),
  at: z.string().datetime().optional(),
})

const CompletedBody = z.object({
  type: z.literal('call.completed'),
  callId: z.string(),
  endedAt: z.string().datetime(),
  durationSec: z.number().int().nonnegative(),
  outcome: z.enum(['completed', 'no_answer', 'busy', 'failed', 'voicemail']),
  cost: z
    .object({
      sttPaisa: z.number().int().nonnegative().default(0),
      llmPaisa: z.number().int().nonnegative().default(0),
      ttsPaisa: z.number().int().nonnegative().default(0),
      sipPaisa: z.number().int().nonnegative().default(0),
      totalPaisa: z.number().int().nonnegative(),
    })
    .optional(),
  audioUrl: z.string().url().optional(),
  summary: z.string().max(2000).optional(),
  sentiment: z.string().max(64).optional(),
  businessOutcome: z.unknown().optional(),
  hangupCause: z.string().max(120).optional(),
})

const Body = z.discriminatedUnion('type', [StartedBody, TranscriptBody, DtmfBody, CompletedBody])

function authOk(req: Request): boolean {
  if (!SHARED_SECRET) return false
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${SHARED_SECRET}`
}

export const POST = withErrors(async (req: Request) => {
  if (!authOk(req)) return apiError('unauthenticated')
  const data = Body.parse(await req.json().catch(() => ({})))
  await connectMongo()

  if (data.type === 'call.started') {
    if (!Types.ObjectId.isValid(data.agentId) || !Types.ObjectId.isValid(data.orgId)) {
      return apiError('invalid_input')
    }
    const agent = await Agent.findOne({ _id: data.agentId, orgId: data.orgId }).lean()
    if (!agent) return apiError('not_found')
    const callId =
      data.callId && Types.ObjectId.isValid(data.callId)
        ? data.callId
        : new Types.ObjectId().toString()
    const call = await Call.findOneAndUpdate(
      { _id: callId },
      {
        $setOnInsert: {
          _id: callId,
          orgId: data.orgId,
          agentId: data.agentId,
          direction: data.direction,
          fromE164: data.fromE164,
          toE164: data.toE164,
          tier: data.tier,
          startedAt: new Date(data.startedAt),
          metadata: data.metadata || {},
          latency: { callCreatedAt: data.startedAt },
        },
        $set: { edgeUuid: data.edgeUuid, outcome: 'in_progress' },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
    if (!call) return apiError('not_found')
    emitWebhook(data.orgId, 'call.started', {
      callId: String(call._id),
      agentId: data.agentId,
    }).catch(() => {})
    return NextResponse.json({ id: String(call._id) })
  }

  if (data.type === 'call.transcript') {
    if (!Types.ObjectId.isValid(data.callId)) return apiError('invalid_input')
    await Call.updateOne(
      { _id: data.callId },
      { $push: { transcript: { role: data.role, text: data.text, at: new Date(data.at) } } },
    )
    await enforceTranscriptCompliance(data.callId)
    return NextResponse.json({ ok: true })
  }

  if (data.type === 'call.dtmf') {
    if (!Types.ObjectId.isValid(data.callId)) return apiError('invalid_input')
    const call = await Call.findById(data.callId)
    if (!call) return apiError('not_found')
    call.ivrEvents.push({
      type: 'dtmf',
      digit: data.digit,
      menuItem: data.menuItem || null,
      at: data.at || new Date().toISOString(),
    })
    await call.save()
    const results = await executeWordPressDtmfActions({
      call,
      digit: data.digit,
      menuItem: data.menuItem || null,
    })
    await recordDtmfActionResults(String(call._id), data.digit, results)
    return NextResponse.json({ ok: true, results })
  }

  // call.completed
  if (!Types.ObjectId.isValid(data.callId)) return apiError('invalid_input')
  const call = await Call.findById(data.callId)
  if (!call) return apiError('not_found')
  call.endedAt = new Date(data.endedAt)
  call.durationSec = data.durationSec
  call.outcome = data.outcome
  if (data.cost) call.cost = data.cost
  if (data.audioUrl) call.audioUrl = data.audioUrl
  if (data.summary) call.summary = data.summary
  if (data.sentiment) call.sentiment = data.sentiment
  if (data.hangupCause) call.hangupCause = data.hangupCause
  await call.save()
  await enforceTranscriptCompliance(String(call._id))
  const compliantCall = await Call.findById(call._id)
  if (compliantCall) {
    call.summary = compliantCall.summary
    call.transcript = compliantCall.transcript
    call.metadata = compliantCall.metadata
  }
  const isTestSession = isNonBillableTestSession(call.metadata)
  const agent = await Agent.findOne({ _id: call.agentId, orgId: call.orgId }).lean()
  if (!isTestSession && data.outcome === 'completed') {
    const analyzed = await analyzeBusinessOutcome(compliantCall || call, agent)
    if (analyzed) {
      call.businessOutcome = toStoredBusinessOutcome(analyzed)
      await call.save()
      await updateCampaignAttemptWithBusinessOutcome(call)
    }
  }
  if (!isTestSession) {
    await completeMissedCallbackAttempt(call)
    await enqueueMissedCallbackForCall(call)
  }

  if (!isTestSession && data.cost && data.cost.totalPaisa > 0) {
    await postLedger({
      orgId: String(call.orgId),
      kind: 'usage',
      amountPaisa: -data.cost.totalPaisa,
      description: `${call.tier} call ${data.durationSec}s`,
      callId: String(call._id),
    }).catch(() => {})
  }

  if (isTestSession) {
    return NextResponse.json({ ok: true })
  }

  const event = data.outcome === 'completed' ? 'call.completed' : 'call.failed'
  const webhookPayload = {
    callId: String(call._id),
    agentId: String(call.agentId),
    outcome: data.outcome,
    durationSec: data.durationSec,
    cost: data.cost,
    summary: call.summary,
    sentiment: call.sentiment,
    businessOutcome: call.businessOutcome ?? null,
    transcript: call.transcript,
    audioUrl: call.audioUrl,
  }
  emitWebhook(String(call.orgId), event, webhookPayload).catch(() => {})
  if (agent?.postCallWebhook) {
    emitDirectWebhook(String(call.orgId), event, agent.postCallWebhook, webhookPayload).catch(
      () => {},
    )
  }

  return NextResponse.json({ ok: true })
})

function isNonBillableTestSession(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null) return false
  const source = String((metadata as Record<string, unknown>).source || '')
  return source === 'dashboard-browser-test' || source === 'landing-webcall'
}

function toStoredBusinessOutcome(outcome: Awaited<ReturnType<typeof analyzeBusinessOutcome>>) {
  if (!outcome) return undefined
  return {
    ...outcome,
    amountPaisa: outcome.amountPaisa || 0,
    callbackAt: outcome.callbackAt ? new Date(outcome.callbackAt) : undefined,
    callbackE164: outcome.callbackE164 || '',
    notes: outcome.notes || '',
    extractedAt: outcome.extractedAt || new Date(),
  }
}

async function updateCampaignAttemptWithBusinessOutcome(call: CallDoc) {
  const metadata = call.metadata && typeof call.metadata === 'object' ? call.metadata : {}
  const attemptId = String(metadata.attemptId || metadata.attempt_id || '')
  const campaignId = String(metadata.campaignId || metadata.campaign_id || '')
  const contactId = String(metadata.contactId || metadata.contact_id || '')
  const filter =
    attemptId && Types.ObjectId.isValid(attemptId)
      ? { _id: attemptId }
      : campaignId &&
          contactId &&
          Types.ObjectId.isValid(campaignId) &&
          Types.ObjectId.isValid(contactId)
        ? { campaignId, contactId }
        : null
  if (!filter) return
  const attempt = await CampaignAttempt.findOne(filter)
  if (!attempt) return
  const campaign = await Campaign.findById(attempt.campaignId).lean()
  const maxAttempts = Number(campaign?.maxAttempts ?? 2)
  const next = campaignOutcomeStatus({
    telephonyOutcome: String(call.outcome),
    businessOutcome: call.businessOutcome,
    attempts: Number(attempt.attempts || 0),
    maxAttempts,
  })
  attempt.status = next.status
  attempt.lastOutcome = next.lastOutcome
  attempt.lastReason = call.businessOutcome?.notes || call.hangupCause || next.lastOutcome
  if (next.status === 'queued') {
    attempt.set('completedAt', undefined)
  } else {
    attempt.completedAt = new Date()
  }
  if (next.nextRetryAt) {
    attempt.nextRetryAt = next.nextRetryAt
  } else {
    attempt.set('nextRetryAt', undefined)
  }
  attempt.attemptLog.push({
    at: new Date(),
    outcome: next.lastOutcome,
    reason: attempt.lastReason,
    callId: call._id,
  })
  await attempt.save()
}
