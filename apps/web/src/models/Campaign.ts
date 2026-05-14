import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

export const CAMPAIGN_STATUS = ['draft', 'scheduled', 'running', 'paused', 'completed', 'failed'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number]

const campaignSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    contactIds: [{ type: Schema.Types.ObjectId, ref: 'Contact' }],
    schedule: {
      startAt: { type: Date },
      endAt: { type: Date },
      timezone: { type: String, default: 'Asia/Dhaka' },
      // call windows in minutes from midnight local TZ, inclusive
      windows: { type: [{ from: Number, to: Number }], default: [{ from: 540, to: 1080 }] },
    },
    concurrency: { type: Number, default: 1, min: 1, max: 100 },
    maxAttempts: { type: Number, default: 2 },
    retryRules: {
      noAnswerDelayMin: { type: Number, default: 60 },
      busyDelayMin: { type: Number, default: 30 },
      failedDelayMin: { type: Number, default: 240 },
      voicemailRetry: { type: Boolean, default: true },
    },
    leadScoring: {
      enabled: { type: Boolean, default: false },
      minScore: { type: Number, default: 0 },
      scoreField: { type: String, default: 'score' },
    },
    autoStopGoals: {
      completedCalls: { type: Number, default: 0 },
      conversionRatePct: { type: Number, default: 0 },
      maxSpendPaisa: { type: Number, default: 0 },
    },
    fromE164: { type: String, default: '' }, // override agent's default outbound CLI
    status: { type: String, enum: CAMPAIGN_STATUS, default: 'draft' },
    // counters
    stats: {
      total: { type: Number, default: 0 },
      attempted: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      noAnswer: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
)

campaignSchema.index({ orgId: 1, status: 1, updatedAt: -1 })

export type CampaignDoc = InferSchemaType<typeof campaignSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type CampaignLean = CampaignDoc

export const Campaign: Model<CampaignDoc> =
  (mongoose.models.Campaign as Model<CampaignDoc>) ||
  mongoose.model<CampaignDoc>('Campaign', campaignSchema)
