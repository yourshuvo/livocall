import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const attemptLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    outcome: { type: String, default: '' },
    reason: { type: String, default: '' },
    callId: { type: Schema.Types.ObjectId, ref: 'Call' },
  },
  { _id: false },
)

const campaignAttemptSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    callId: { type: Schema.Types.ObjectId, ref: 'Call' },
    fsUuid: { type: String, default: '' },
    status: {
      type: String,
      enum: ['queued', 'in_progress', 'completed', 'failed', 'failed_terminal'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    leadScore: { type: Number, default: 0 },
    lastOutcome: { type: String, default: '' },
    lastReason: { type: String, default: '' },
    nextRetryAt: { type: Date },
    completedAt: { type: Date },
    attemptLog: { type: [attemptLogSchema], default: [] },
  },
  { timestamps: true },
)

campaignAttemptSchema.index({ campaignId: 1, contactId: 1 }, { unique: true })
campaignAttemptSchema.index({ campaignId: 1, status: 1, nextRetryAt: 1 })

export type CampaignAttemptDoc = InferSchemaType<typeof campaignAttemptSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type CampaignAttemptLean = CampaignAttemptDoc

export const CampaignAttempt: Model<CampaignAttemptDoc> =
  (mongoose.models.CampaignAttempt as Model<CampaignAttemptDoc>) ||
  mongoose.model<CampaignAttemptDoc>('CampaignAttempt', campaignAttemptSchema)