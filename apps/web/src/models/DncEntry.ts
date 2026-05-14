import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

export const DNC_REASONS = ['user_request', 'btrc_complaint', 'opt_out_keyword', 'manual'] as const

const dncSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    e164: { type: String, required: true, index: true },
    reason: { type: String, enum: DNC_REASONS, default: 'user_request' },
    note: { type: String, default: '' },
    sourceCallId: { type: Schema.Types.ObjectId, ref: 'Call' },
  },
  { timestamps: true },
)

dncSchema.index({ orgId: 1, e164: 1 }, { unique: true })

export type DncEntryDoc = InferSchemaType<typeof dncSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type DncEntryLean = DncEntryDoc

export const DncEntry: Model<DncEntryDoc> =
  (mongoose.models.DncEntry as Model<DncEntryDoc>) ||
  mongoose.model<DncEntryDoc>('DncEntry', dncSchema)
