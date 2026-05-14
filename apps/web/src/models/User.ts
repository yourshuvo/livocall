import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const userSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String },
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    role: { type: String, enum: ['owner', 'admin', 'agent'], default: 'owner' },
    locale: { type: String, enum: ['en', 'bn'], default: 'en' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId }

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ||
  mongoose.model<UserDoc>('User', userSchema)
