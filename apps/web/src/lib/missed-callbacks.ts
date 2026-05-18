import { Types } from 'mongoose'
import { Call, type CallDoc } from '@/models/Call'
import { PhoneNumber, type PhoneNumberLean } from '@/models/PhoneNumber'
import { Agent } from '@/models/Agent'
import { DncEntry } from '@/models/DncEntry'
import { MissedCallback, type MissedCallbackDoc } from '@/models/MissedCallback'
import { getOriginationGuard } from '@/lib/billing-caps'
import { resolveAgentTools } from '@/lib/secret-vault'
import { voiceClient } from '@/lib/voice-client'
import {
  callbackAttemptStatusForOutcome,
  nextAllowedCallbackTime,
  normalizeAutoCallbackConfig,
  retryCallbackTime,
  shouldEnqueueMissedCallback,
  type AutoCallbackConfig,
} from '@/lib/auto-callback'

const E164 = /^\+\d{8,15}$/
type MissedCallbackWithSave = MissedCallbackDoc & { save: () => Promise<unknown> }

export async function enqueueMissedCallbackForCall(call: CallDoc) {
  const configSource = await getCallbackConfigForCall(call)
  if (!configSource) return { enqueued: false, reason: 'callback not configured' }
  const { number, config } = configSource
  if (
    !shouldEnqueueMissedCallback({
      config,
      direction: String(call.direction),
      outcome: String(call.outcome),
      callerE164: call.fromE164,
    })
  ) {
    return { enqueued: false, reason: 'call is not eligible' }
  }
  if (!number.agentId) return { enqueued: false, reason: 'number has no agent' }
  if (!number.outboundEnabled) return { enqueued: false, reason: 'number outbound disabled' }

  const sourceCallId = toObjectId(call._id)
  if (!sourceCallId) return { enqueued: false, reason: 'invalid source call id' }
  const duplicate = await MissedCallback.exists({ sourceCallId })
  if (duplicate) return { enqueued: false, reason: 'duplicate source call' }

  const agent = await Agent.findOne({ _id: number.agentId, orgId: call.orgId }).lean()
  if (!agent || agent.status !== 'live') return { enqueued: false, reason: 'agent is not live' }

  const now = new Date()
  if (config.cooldownMinutesPerCaller > 0) {
    const cutoff = new Date(now.getTime() - config.cooldownMinutesPerCaller * 60_000)
    const recent = await MissedCallback.exists({
      orgId: call.orgId,
      phoneNumberId: number._id,
      callerE164: call.fromE164,
      createdAt: { $gte: cutoff },
      status: { $ne: 'skipped' },
    })
    if (recent) return { enqueued: false, reason: 'caller cooldown active' }
  }

  const dailyCount = await MissedCallback.countDocuments({
    orgId: call.orgId,
    phoneNumberId: number._id,
    createdAt: { $gte: startOfUtcDay(now) },
    status: { $ne: 'skipped' },
  })
  if (dailyCount >= config.maxCallbacksPerDay) {
    return { enqueued: false, reason: 'daily callback limit reached' }
  }

  const nextRunAt = nextAllowedCallbackTime(now, config)
  await MissedCallback.updateOne(
    { sourceCallId },
    {
      $setOnInsert: {
        orgId: call.orgId,
        phoneNumberId: number._id,
        agentId: number.agentId,
        sourceCallId,
        callerE164: call.fromE164,
        fromE164: call.toE164,
        sourceOutcome: call.outcome,
        status: 'queued',
        attempts: 0,
        maxAttempts: config.maxAttempts,
        nextRunAt,
        policySnapshot: config,
      },
    },
    { upsert: true },
  )
  return { enqueued: true, nextRunAt }
}

export async function completeMissedCallbackAttempt(call: CallDoc) {
  const metadata = call.metadata && typeof call.metadata === 'object' ? call.metadata : {}
  if (String(metadata.source || '') !== 'missed-callback') return
  const attemptId = String(metadata.callbackAttemptId || metadata.callback_attempt_id || '')
  if (!Types.ObjectId.isValid(attemptId)) return
  const attempt = await MissedCallback.findById(attemptId)
  if (!attempt) return
  const config = normalizeAutoCallbackConfig(attempt.policySnapshot)
  const nextStatus = callbackAttemptStatusForOutcome({
    outcome: String(call.outcome),
    attempts: Number(attempt.attempts || 0),
    maxAttempts: Number(attempt.maxAttempts || config.maxAttempts),
  })
  attempt.callbackCallId = call._id
  attempt.lastError = call.hangupCause || ''
  if (nextStatus === 'completed') {
    attempt.status = 'completed'
    attempt.completedAt = new Date()
  } else if (nextStatus === 'queued') {
    attempt.status = 'queued'
    attempt.nextRunAt = retryCallbackTime(new Date(), config)
  } else {
    attempt.status = 'failed'
    attempt.completedAt = new Date()
  }
  await attempt.save()
}

export async function runMissedCallbackTick(limit = 32) {
  const now = new Date()
  const attempts = await MissedCallback.find({
    status: 'queued',
    nextRunAt: { $lte: now },
    attempts: { $lt: 5 },
  })
    .sort({ nextRunAt: 1 })
    .limit(limit)
  const result = { originated: 0, completed: 0, skipped: 0, failed: 0, deferred: 0 }
  for (const attempt of attempts) {
    const config = normalizeAutoCallbackConfig(attempt.policySnapshot)
    const quietAdjusted = nextAllowedCallbackTime(now, { ...config, delaySeconds: 0 })
    if (quietAdjusted.getTime() > now.getTime() + 1000) {
      attempt.nextRunAt = quietAdjusted
      await attempt.save()
      result.deferred += 1
      continue
    }

    const skipReason = await callbackSkipReason(attempt)
    if (skipReason) {
      await markSkipped(attempt, skipReason)
      result.skipped += 1
      continue
    }

    const number = await PhoneNumber.findOne({
      _id: attempt.phoneNumberId,
      orgId: attempt.orgId,
    }).lean()
    const agent = await Agent.findOne({ _id: attempt.agentId, orgId: attempt.orgId })
    if (!number || !agent) {
      await markSkipped(attempt, 'number or agent missing')
      result.skipped += 1
      continue
    }
    try {
      const tools = await resolveAgentTools(String(attempt.orgId), agent.tools || [])
      const response = await voiceClient.originate({
        agentId: String(agent._id),
        toE164: attempt.callerE164,
        fromE164: attempt.fromE164,
        tier: agent.tier,
        tools,
        metadata: {
          source: 'missed-callback',
          sourceCallId: String(attempt.sourceCallId),
          callbackAttemptId: String(attempt._id),
          phoneNumberId: String(attempt.phoneNumberId),
        },
      })
      attempt.status = 'in_progress'
      attempt.attempts += 1
      attempt.lastAttemptAt = new Date()
      attempt.lastError = ''
      if (Types.ObjectId.isValid(response.callId)) {
        attempt.callbackCallId = new Types.ObjectId(response.callId)
      }
      await attempt.save()
      result.originated += 1
    } catch (e) {
      attempt.attempts += 1
      attempt.lastAttemptAt = new Date()
      attempt.lastError = e instanceof Error ? e.message : 'origination failed'
      if (attempt.attempts < Number(attempt.maxAttempts || config.maxAttempts)) {
        attempt.status = 'queued'
        attempt.nextRunAt = retryCallbackTime(new Date(), config)
      } else {
        attempt.status = 'failed'
        attempt.completedAt = new Date()
        result.failed += 1
      }
      await attempt.save()
    }
  }
  return result
}

async function getCallbackConfigForCall(call: CallDoc) {
  if (call.direction !== 'inbound') return null
  const number = await PhoneNumber.findOne({
    orgId: call.orgId,
    e164: call.toE164,
    inboundEnabled: true,
  }).lean<PhoneNumberLean>()
  if (!number) return null
  return { number, config: normalizeAutoCallbackConfig(number.autoCallback) }
}

async function callbackSkipReason(attempt: MissedCallbackDoc) {
  if (!E164.test(attempt.callerE164)) return 'invalid caller number'
  const config = normalizeAutoCallbackConfig(attempt.policySnapshot)
  if (config.cooldownMinutesPerCaller > 0) {
    const cooldownSince = new Date(Date.now() - config.cooldownMinutesPerCaller * 60_000)
    const recentCallback = await MissedCallback.exists({
      _id: { $ne: attempt._id },
      orgId: attempt.orgId,
      phoneNumberId: attempt.phoneNumberId,
      callerE164: attempt.callerE164,
      lastAttemptAt: { $gte: cooldownSince },
      status: { $ne: 'skipped' },
    })
    if (recentCallback) return 'caller cooldown active'
  }
  const callbacksToday = await MissedCallback.countDocuments({
    orgId: attempt.orgId,
    phoneNumberId: attempt.phoneNumberId,
    lastAttemptAt: { $gte: startOfUtcDay() },
    status: { $ne: 'skipped' },
  })
  if (callbacksToday >= config.maxCallbacksPerDay) return 'daily callback limit reached'
  const [number, agent, dnc, guard] = await Promise.all([
    PhoneNumber.findOne({ _id: attempt.phoneNumberId, orgId: attempt.orgId }).lean(),
    Agent.findOne({ _id: attempt.agentId, orgId: attempt.orgId }).lean(),
    DncEntry.findOne({ orgId: attempt.orgId, e164: attempt.callerE164 }).lean(),
    getOriginationGuard(String(attempt.orgId)),
  ])
  if (!number) return 'number missing'
  if (!number.outboundEnabled) return 'number outbound disabled'
  if (!number.agentId || String(number.agentId) !== String(attempt.agentId))
    return 'number agent changed'
  if (!agent || agent.status !== 'live') return 'agent is not live'
  if (dnc) return 'destination is on the org DNC list'
  if (!guard.ok) return guard.reason || 'origination blocked'
  return ''
}

async function markSkipped(attempt: MissedCallbackWithSave, reason: string) {
  attempt.status = 'skipped'
  attempt.skipReason = reason
  attempt.completedAt = new Date()
  await attempt.save()
}

function startOfUtcDay(d = new Date()): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function toObjectId(value: unknown) {
  const s = String(value || '')
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null
}
