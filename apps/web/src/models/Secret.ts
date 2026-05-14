import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const secretSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    name: { type: String, required: true },
    kind: {
      type: String,
      enum: ['api_key', 'bearer_token', 'basic_auth', 'webhook_secret', 'custom'],
      default: 'custom',
    },
    provider: { type: String, default: '' },
    ciphertext: { type: String, required: true, select: false },
    fingerprint: { type: String, required: true },
    version: { type: Number, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rotatedAt: { type: Date },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
)

secretSchema.index({ orgId: 1, name: 1 }, { unique: true })
secretSchema.index({ orgId: 1, revokedAt: 1 })

export type SecretDoc = InferSchemaType<typeof secretSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type SecretLean = SecretDoc

export const Secret: Model<SecretDoc> =
  (mongoose.models.Secret as Model<SecretDoc>) ||
  mongoose.model<SecretDoc>('Secret', secretSchema)