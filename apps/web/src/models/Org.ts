import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const orgSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    clerkOrgId: { type: String },
    plan: { type: String, enum: ['starter', 'growth', 'scale'], default: 'starter' },
    creditsPaisa: { type: Number, default: 0 },
    btrcDisclosure: { type: String, default: '' },
    recordingConsent: {
      type: String,
      enum: ['required', 'optional', 'disabled'],
      default: 'optional',
    },
    btrcDisclosureAudioUrl: { type: String, default: '' },
    // Short consent prompt the dialplan plays before recording (separate from
    // the longer pre-call BTRC disclosure above). Surfaced to the voice
    // service as the `livocall_consent_prompt` channel variable.
    btrcConsentPromptUrl: { type: String, default: '' },
    // Spend caps in paisa. 0 = no cap.
    dailySpendCapPaisa: { type: Number, default: 0 },
    monthlySpendCapPaisa: { type: Number, default: 0 },
    compliance: {
      piiRedaction: { type: Boolean, default: true },
      detectOptOutSpeech: { type: Boolean, default: true },
      retentionDays: { type: Number, default: 365 },
      auditLogRetentionDays: { type: Number, default: 730 },
      agentRoleCanExport: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
)

orgSchema.index({ clerkOrgId: 1 }, { sparse: true })

export type OrgDoc = InferSchemaType<typeof orgSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type OrgLean = OrgDoc

export const Org: Model<OrgDoc> =
  (mongoose.models.Org as Model<OrgDoc>) || mongoose.model<OrgDoc>('Org', orgSchema)
