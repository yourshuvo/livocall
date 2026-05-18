import type { Model } from 'mongoose'
import { Agent } from '@/models/Agent'
import { ApiKey } from '@/models/ApiKey'
import { AuditLog } from '@/models/AuditLog'
import { Call } from '@/models/Call'
import { Campaign } from '@/models/Campaign'
import { CampaignAttempt } from '@/models/CampaignAttempt'
import { DncEntry } from '@/models/DncEntry'
import { KnowledgeBase } from '@/models/KnowledgeBase'
import { MissedCallback } from '@/models/MissedCallback'
import { Secret } from '@/models/Secret'
import { User } from '@/models/User'

const MODELS: Model<never>[] = [
  Agent as unknown as Model<never>,
  ApiKey as unknown as Model<never>,
  AuditLog as unknown as Model<never>,
  Call as unknown as Model<never>,
  Campaign as unknown as Model<never>,
  CampaignAttempt as unknown as Model<never>,
  DncEntry as unknown as Model<never>,
  KnowledgeBase as unknown as Model<never>,
  MissedCallback as unknown as Model<never>,
  Secret as unknown as Model<never>,
  User as unknown as Model<never>,
]

export async function verifyProductionIndexes() {
  const results: { model: string; ok: boolean; message: string }[] = []
  for (const model of MODELS) {
    try {
      await model.createIndexes()
      const indexes = await model.collection.indexes()
      results.push({ model: model.modelName, ok: true, message: `${indexes.length} index(es)` })
    } catch (e) {
      results.push({ model: model.modelName, ok: false, message: (e as Error).message })
    }
  }
  return results
}
