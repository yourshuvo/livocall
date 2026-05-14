import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const contactSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    e164: { type: String, required: true, index: true },
    name: { type: String, default: '' },
    locale: { type: String, enum: ['bn', 'en', 'mixed'], default: 'mixed' },
    attrs: { type: Schema.Types.Mixed, default: {} }, // free-form metadata for prompt templating (Record<string, string>)
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
)

contactSchema.index({ orgId: 1, e164: 1 }, { unique: true })

export type ContactDoc = InferSchemaType<typeof contactSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type ContactLean = ContactDoc

export const Contact: Model<ContactDoc> =
  (mongoose.models.Contact as Model<ContactDoc>) ||
  mongoose.model<ContactDoc>('Contact', contactSchema)
