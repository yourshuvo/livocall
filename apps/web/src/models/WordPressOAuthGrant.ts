import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const wordpressOAuthGrantSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    connectionId: { type: Schema.Types.ObjectId, ref: 'Connection', required: true, index: true },
    codeHash: { type: String, required: true, unique: true, index: true },
    codeChallenge: { type: String, required: true },
    codeChallengeMethod: { type: String, enum: ['S256'], default: 'S256' },
    state: { type: String, required: true },
    callbackUrl: { type: String, required: true },
    siteUrl: { type: String, required: true },
    siteName: { type: String, default: '' },
    pluginVersion: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date },
  },
  { timestamps: true },
)

wordpressOAuthGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type WordPressOAuthGrantDoc = InferSchemaType<typeof wordpressOAuthGrantSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type WordPressOAuthGrantLean = WordPressOAuthGrantDoc

export const WordPressOAuthGrant: Model<WordPressOAuthGrantDoc> =
  (mongoose.models.WordPressOAuthGrant as Model<WordPressOAuthGrantDoc>) ||
  mongoose.model<WordPressOAuthGrantDoc>('WordPressOAuthGrant', wordpressOAuthGrantSchema)
