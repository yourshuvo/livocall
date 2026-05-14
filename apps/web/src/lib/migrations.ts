import { getObjectBuffer, objectKeyFromUrl, objectStorageIsRemote, putObject } from '@/lib/object-storage'
import { Campaign } from '@/models/Campaign'
import { CampaignAttempt } from '@/models/CampaignAttempt'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import { Org } from '@/models/Org'
import { Secret } from '@/models/Secret'

export async function backfillProductionFields() {
  const [orgs, campaigns, secrets, knowledge] = await Promise.all([
    Org.updateMany(
      { compliance: { $exists: false } },
      {
        $set: {
          compliance: {
            piiRedaction: true,
            detectOptOutSpeech: true,
            retentionDays: 365,
            auditLogRetentionDays: 730,
            agentRoleCanExport: false,
          },
        },
      },
    ),
    Campaign.updateMany(
      { retryRules: { $exists: false } },
      {
        $set: {
          retryRules: { noAnswerDelayMin: 60, busyDelayMin: 30, failedDelayMin: 240, voicemailRetry: true },
          leadScoring: { enabled: false, minScore: 0, scoreField: 'score' },
          autoStopGoals: { completedCalls: 0, conversionRatePct: 0, maxSpendPaisa: 0 },
        },
      },
    ),
    Secret.updateMany({ version: { $exists: false } }, { $set: { version: 1 } }),
    KnowledgeBase.updateMany(
      { 'sources.ingestion': { $exists: false } },
      {
        $set: {
          'sources.$[].ingestion': {
            status: 'queued',
            chunkCount: 0,
            extractedChars: 0,
            error: '',
          },
        },
      },
    ),
  ])

  const activeCampaigns = await Campaign.find({ status: { $in: ['scheduled', 'running'] } }).lean()
  let attemptsCreated = 0
  for (const campaign of activeCampaigns) {
    for (const contactId of campaign.contactIds || []) {
      const result = await CampaignAttempt.updateOne(
        { campaignId: campaign._id, contactId },
        { $setOnInsert: { campaignId: campaign._id, contactId, status: 'queued', attempts: 0 } },
        { upsert: true },
      )
      attemptsCreated += result.upsertedCount || 0
    }
  }

  return {
    orgs: orgs.modifiedCount || 0,
    campaigns: campaigns.modifiedCount || 0,
    secrets: secrets.modifiedCount || 0,
    knowledge: knowledge.modifiedCount || 0,
    attemptsCreated,
  }
}

export async function migrateLocalKnowledgeFiles() {
  if (!objectStorageIsRemote()) return { migrated: 0, skipped: 'remote object storage is not configured' }
  const kbs = await KnowledgeBase.find({ 'sources.storage.provider': 'local' })
  let migrated = 0
  for (const kb of kbs) {
    let changed = false
    for (const source of kb.sources || []) {
      if (source.storage?.provider !== 'local') continue
      const ref = source.ref || source.storage.key
      if (!ref) continue
      const key = source.storage.key || objectKeyFromUrl(ref)
      const body = await getObjectBuffer(ref)
      const stored = await putObject(key, body, 'application/octet-stream')
      source.ref = stored.url
      source.storage = { provider: stored.provider, key: stored.key }
      changed = true
      migrated += 1
    }
    if (changed) await kb.save()
  }
  return { migrated }
}
