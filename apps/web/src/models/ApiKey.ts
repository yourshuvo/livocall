import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const apiKeySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    name: { type: String, required: true },
    prefix: { type: String, required: true, index: true },
    hash: { type: String, required: true, select: false },
    scopes: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
)

apiKeySchema.index({ orgId: 1, prefix: 1 })

export type ApiKeyDoc = InferSchemaType<typeof apiKeySchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type ApiKeyLean = ApiKeyDoc

export const ApiKey: Model<ApiKeyDoc> =
  (mongoose.models.ApiKey as Model<ApiKeyDoc>) ||
  mongoose.model<ApiKeyDoc>('ApiKey', apiKeySchema)