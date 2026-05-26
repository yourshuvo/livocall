import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const sourceSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['url', 'website', 'pdf', 'docx', 'text'],
      required: true,
    },
    ref: { type: String, required: true },
    content: { type: String, default: '' },
    title: { type: String, default: '' },
    storage: {
      provider: { type: String, enum: ['local', 's3', 'external', 'inline'] },
      key: { type: String, default: '' },
    },
    ingestion: {
      status: {
        type: String,
        enum: ['queued', 'processing', 'extracting', 'ready', 'failed'],
        default: 'queued',
      },
      chunkCount: { type: Number, default: 0 },
      extractedChars: { type: Number, default: 0 },
      error: { type: String, default: '' },
      extractedAt: { type: Date },
    },
    addedAt: { type: Date },
  },
  { _id: false },
)

const knowledgeBaseSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    name: { type: String, required: true },
    sources: { type: [sourceSchema], default: [] },
    embeddingNamespace: { type: String, default: '' },
    quality: {
      score: { type: Number, default: 0 },
      readySources: { type: Number, default: 0 },
      failedSources: { type: Number, default: 0 },
      chunkCount: { type: Number, default: 0 },
      extractedChars: { type: Number, default: 0 },
      recommendations: { type: [String], default: [] },
      updatedAt: { type: Date },
    },
  },
  { timestamps: true },
)

knowledgeBaseSchema.index({ orgId: 1, updatedAt: -1 })

export type KnowledgeBaseDoc = InferSchemaType<typeof knowledgeBaseSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type KnowledgeBaseLean = KnowledgeBaseDoc

export const KnowledgeBase: Model<KnowledgeBaseDoc> =
  (mongoose.models.KnowledgeBase as Model<KnowledgeBaseDoc>) ||
  mongoose.model<KnowledgeBaseDoc>('KnowledgeBase', knowledgeBaseSchema)
