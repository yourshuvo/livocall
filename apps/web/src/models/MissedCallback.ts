import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const missedCallbackSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    phoneNumberId: { type: Schema.Types.ObjectId, ref: 'PhoneNumber', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    sourceCallId: { type: Schema.Types.ObjectId, ref: 'Call', required: true, unique: true },
    callbackCallId: { type: Schema.Types.ObjectId, ref: 'Call' },
    callerE164: { type: String, required: true, index: true },
    fromE164: { type: String, required: true },
    sourceOutcome: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'in_progress', 'completed', 'failed', 'skipped'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 1 },
    nextRunAt: { type: Date, required: true, index: true },
    lastAttemptAt: { type: Date },
    completedAt: { type: Date },
    skipReason: { type: String, default: '' },
    lastError: { type: String, default: '' },
    policySnapshot: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

missedCallbackSchema.index({ status: 1, nextRunAt: 1 })
missedCallbackSchema.index({ orgId: 1, phoneNumberId: 1, callerE164: 1, createdAt: -1 })

export type MissedCallbackDoc = InferSchemaType<typeof missedCallbackSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type MissedCallbackLean = MissedCallbackDoc

export const MissedCallback: Model<MissedCallbackDoc> =
  (mongoose.models.MissedCallback as Model<MissedCallbackDoc>) ||
  mongoose.model<MissedCallbackDoc>('MissedCallback', missedCallbackSchema)
