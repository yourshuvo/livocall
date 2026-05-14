import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    role: { type: String, enum: ['owner', 'admin', 'agent'], default: 'agent' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

membershipSchema.index({ userId: 1, orgId: 1 }, { unique: true })
membershipSchema.index({ orgId: 1, role: 1 })

export type MembershipDoc = InferSchemaType<typeof membershipSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type MembershipLean = MembershipDoc

export const Membership: Model<MembershipDoc> =
  (mongoose.models.Membership as Model<MembershipDoc>) ||
  mongoose.model<MembershipDoc>('Membership', membershipSchema)