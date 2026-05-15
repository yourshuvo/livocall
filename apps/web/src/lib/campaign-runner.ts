import { Campaign } from '@/models/Campaign'
import { CampaignAttempt } from '@/models/CampaignAttempt'
import { Contact } from '@/models/Contact'
import { Agent } from '@/models/Agent'
import { Call } from '@/models/Call'
import { DncEntry } from '@/models/DncEntry'
import { voiceClient } from '@/lib/voice-client'
import { resolveAgentTools } from '@/lib/secret-vault'
import { Types } from 'mongoose'
import { getOriginationGuard } from '@/lib/billing-caps'
import { campaignOutcomeStatus } from '@/lib/business-outcomes'

interface CampaignScheduleLike {
  startAt?: Date | null
  endAt?: Date | null
  windows?: { from?: number | null; to?: number | null }[] | null
}

interface CampaignLike {
  _id: unknown
  schedule?: CampaignScheduleLike | null
  contactIds?: unknown[] | null
  retryRules?: {
    noAnswerDelayMin?: number | null
    busyDelayMin?: number | null
    failedDelayMin?: number | null
    voicemailRetry?: boolean | null
  } | null
  leadScoring?: {
    enabled?: boolean | null
    minScore?: number | null
    scoreField?: string | null
  } | null
}

interface AutoStopGoals {
  completedCalls?: number | null
  conversionRatePct?: number | null
  maxSpendPaisa?: number | null
}

function minutesInDhaka(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0)
  return hour * 60 + minute
}

function inWindow(campaign: CampaignLike, now = new Date()) {
  const schedule = campaign.schedule
  if (schedule?.startAt && schedule.startAt > now) return false
  if (schedule?.endAt && schedule.endAt < now) return false
  const windows = schedule?.windows?.length ? schedule.windows : [{ from: 540, to: 1080 }]
  const minute = minutesInDhaka(now)
  return windows.some((w) => minute >= Number(w.from ?? 0) && minute <= Number(w.to ?? 1440))
}

function retryDelayMin(campaign: CampaignLike, outcome: string): number | null {
  if (outcome === 'no_answer') return Number(campaign.retryRules?.noAnswerDelayMin ?? 60)
  if (outcome === 'busy') return Number(campaign.retryRules?.busyDelayMin ?? 30)
  if (outcome === 'voicemail')
    return campaign.retryRules?.voicemailRetry === false
      ? null
      : Number(campaign.retryRules?.noAnswerDelayMin ?? 60)
  if (outcome === 'failed') return Number(campaign.retryRules?.failedDelayMin ?? 240)
  return null
}

async function syncCompletedAttempts() {
  const inFlight = await CampaignAttempt.find({
    status: 'in_progress',
    callId: { $exists: true },
  }).limit(250)
  let updated = 0
  for (const attempt of inFlight) {
    const call = await Call.findById(attempt.callId).lean()
    if (!call || call.outcome === 'in_progress') continue
    const campaign = await Campaign.findById(attempt.campaignId)
    if (!campaign) continue
    const outcome = String(call.outcome)
    attempt.completedAt = new Date()
    if (outcome === 'completed') {
      const next = campaignOutcomeStatus({
        telephonyOutcome: outcome,
        businessOutcome: call.businessOutcome,
        attempts: Number(attempt.attempts || 0),
        maxAttempts: Number(campaign.maxAttempts ?? 2),
      })
      attempt.status = next.status
      attempt.lastOutcome = next.lastOutcome
      attempt.nextRetryAt = next.nextRetryAt
      attempt.lastReason = call.businessOutcome?.notes || call.hangupCause || next.lastOutcome
      attempt.attemptLog.push({
        at: new Date(),
        outcome: next.lastOutcome,
        reason: attempt.lastReason,
        callId: call._id,
      })
    } else if (attempt.attempts >= Number(campaign.maxAttempts ?? 2)) {
      attempt.status = 'failed_terminal'
      attempt.lastOutcome = outcome
      attempt.lastReason = call.hangupCause || ''
      attempt.attemptLog.push({
        at: new Date(),
        outcome,
        reason: attempt.lastReason,
        callId: call._id,
      })
    } else {
      const delay = retryDelayMin(campaign, outcome)
      attempt.lastOutcome = outcome
      attempt.lastReason = call.hangupCause || ''
      if (delay === null) {
        attempt.status = 'failed_terminal'
      } else {
        attempt.status = 'queued'
        attempt.nextRetryAt = new Date(Date.now() + delay * 60_000)
      }
      attempt.attemptLog.push({
        at: new Date(),
        outcome,
        reason: attempt.lastReason,
        callId: call._id,
      })
    }
    await attempt.save()
    updated += 1
  }
  return updated
}

async function refreshCampaignStats(campaignId: string) {
  const [total, attempted, completed, failed, noAnswer] = await Promise.all([
    CampaignAttempt.countDocuments({ campaignId }),
    CampaignAttempt.countDocuments({ campaignId, attempts: { $gt: 0 } }),
    CampaignAttempt.countDocuments({ campaignId, status: 'completed' }),
    CampaignAttempt.countDocuments({ campaignId, status: { $in: ['failed', 'failed_terminal'] } }),
    CampaignAttempt.countDocuments({ campaignId, lastOutcome: 'no_answer' }),
  ])
  return { total, attempted, completed, failed, noAnswer }
}

async function ensureAttempts(campaign: CampaignLike) {
  const contactIds = (campaign.contactIds || []).map(String)
  if (!contactIds.length) return
  const contacts = await Contact.find({ _id: { $in: contactIds } }).lean()
  for (const contact of contacts) {
    const scoreField = campaign.leadScoring?.scoreField || 'score'
    const rawScore =
      contact.attrs && typeof contact.attrs === 'object'
        ? Number((contact.attrs as Record<string, unknown>)[scoreField] ?? 0)
        : 0
    if (campaign.leadScoring?.enabled && rawScore < Number(campaign.leadScoring?.minScore ?? 0))
      continue
    await CampaignAttempt.updateOne(
      { campaignId: campaign._id, contactId: contact._id },
      {
        $setOnInsert: {
          campaignId: campaign._id,
          contactId: contact._id,
          leadScore: Number.isFinite(rawScore) ? rawScore : 0,
          status: 'queued',
        },
      },
      { upsert: true },
    )
  }
}

export async function runCampaignTick(limit = 50) {
  const synced = await syncCompletedAttempts()
  const campaigns = await Campaign.find({ status: 'running' }).limit(50)
  const result = { synced, originated: 0, completedCampaigns: 0, skipped: 0 }
  for (const campaign of campaigns) {
    await ensureAttempts(campaign)
    if (!inWindow(campaign)) {
      result.skipped += 1
      continue
    }
    const stats = await refreshCampaignStats(String(campaign._id))
    const spent = await Call.aggregate([
      { $match: { orgId: campaign.orgId, 'metadata.campaignId': String(campaign._id) } },
      { $group: { _id: null, total: { $sum: '$cost.totalPaisa' } } },
    ])
    const spendPaisa = Number(spent[0]?.total || 0)
    const conversionRate = stats.attempted ? (stats.completed / stats.attempted) * 100 : 0
    const goals: AutoStopGoals = campaign.autoStopGoals || {}
    if (
      (goals.completedCalls && stats.completed >= goals.completedCalls) ||
      (goals.conversionRatePct && conversionRate >= goals.conversionRatePct) ||
      (goals.maxSpendPaisa && spendPaisa >= goals.maxSpendPaisa)
    ) {
      campaign.status = 'completed'
      campaign.stats = stats
      await campaign.save()
      result.completedCampaigns += 1
      continue
    }
    const billingGuard = await getOriginationGuard(String(campaign.orgId))
    if (!billingGuard.ok) {
      campaign.status = 'paused'
      campaign.stats = stats
      await campaign.save()
      result.skipped += 1
      continue
    }
    const active = await CampaignAttempt.countDocuments({
      campaignId: campaign._id,
      status: 'in_progress',
    })
    const capacity = Math.max(
      0,
      Math.min(Number(campaign.concurrency || 1) - active, limit - result.originated),
    )
    if (capacity <= 0) continue
    const attempts = await CampaignAttempt.find({
      campaignId: campaign._id,
      status: 'queued',
      attempts: { $lt: Number(campaign.maxAttempts || 2) },
      $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: { $lte: new Date() } }],
    })
      .sort({ leadScore: -1, updatedAt: 1 })
      .limit(capacity)
    const agent = await Agent.findOne({ _id: campaign.agentId, orgId: campaign.orgId })
    if (!agent) continue
    const tools = await resolveAgentTools(String(campaign.orgId), agent.tools || [])
    for (const attempt of attempts) {
      const contact = await Contact.findById(attempt.contactId).lean()
      if (!contact) {
        attempt.status = 'failed_terminal'
        attempt.lastReason = 'contact missing'
        await attempt.save()
        continue
      }
      const dnc = await DncEntry.findOne({ orgId: campaign.orgId, e164: contact.e164 }).lean()
      if (dnc) {
        attempt.status = 'failed_terminal'
        attempt.lastOutcome = 'dnc'
        attempt.lastReason = 'contact on DNC list'
        attempt.attemptLog.push({ at: new Date(), outcome: 'dnc', reason: 'contact on DNC list' })
        await attempt.save()
        continue
      }
      try {
        const response = await voiceClient.originate({
          agentId: String(agent._id),
          toE164: contact.e164,
          fromE164: campaign.fromE164 || undefined,
          tier: agent.tier,
          tools,
          metadata: {
            source: 'campaign',
            campaignId: String(campaign._id),
            attemptId: String(attempt._id),
            contactId: String(contact._id),
          },
        })
        attempt.status = 'in_progress'
        attempt.attempts += 1
        if (Types.ObjectId.isValid(response.callId))
          attempt.callId = new Types.ObjectId(response.callId)
        attempt.fsUuid = response.fsUuid || ''
        attempt.attemptLog.push({
          at: new Date(),
          outcome: 'originated',
          reason: response.queued ? 'queued' : 'started',
        })
        await attempt.save()
        result.originated += 1
      } catch (e) {
        attempt.status =
          attempt.attempts + 1 >= Number(campaign.maxAttempts || 2) ? 'failed_terminal' : 'queued'
        attempt.attempts += 1
        attempt.lastOutcome = 'failed'
        attempt.lastReason = e instanceof Error ? e.message : 'origination failed'
        attempt.nextRetryAt = new Date(
          Date.now() + Number(campaign.retryRules?.failedDelayMin ?? 240) * 60_000,
        )
        attempt.attemptLog.push({ at: new Date(), outcome: 'failed', reason: attempt.lastReason })
        await attempt.save()
      }
    }
    campaign.stats = await refreshCampaignStats(String(campaign._id))
    if (
      campaign.stats.total > 0 &&
      campaign.stats.completed + campaign.stats.failed >= campaign.stats.total
    ) {
      campaign.status = 'completed'
    }
    await campaign.save()
  }
  return result
}
