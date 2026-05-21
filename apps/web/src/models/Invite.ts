import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

/**
 * Invite a user (by email) to join an org. The invitee follows the emailed
 * link, which carries the token; accepting creates a Membership.
 */
const inviteSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    role: { type: String, enum: ['owner', 'admin', 'agent'], default: 'agent' },
    tokenHash: { type: String, required: true, unique: true, index: true },
    clerkInvitationId: { type: String, index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
)

inviteSchema.index({ orgId: 1, email: 1, acceptedAt: 1, revokedAt: 1 })

export type InviteDoc = InferSchemaType<typeof inviteSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type InviteLean = InviteDoc

export const Invite: Model<InviteDoc> =
  (mongoose.models.Invite as Model<InviteDoc>) || mongoose.model<InviteDoc>('Invite', inviteSchema)
