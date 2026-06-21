import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'
import { DEFAULT_AUTO_CALLBACK_CONFIG } from '@/lib/auto-callback'

const autoCallbackSchema = new Schema(
  {
    enabled: { type: Boolean, default: DEFAULT_AUTO_CALLBACK_CONFIG.enabled },
    eligibleOutcomes: {
      type: [String],
      enum: ['no_answer', 'busy', 'failed', 'voicemail'],
      default: () => [...DEFAULT_AUTO_CALLBACK_CONFIG.eligibleOutcomes],
    },
    delaySeconds: { type: Number, default: DEFAULT_AUTO_CALLBACK_CONFIG.delaySeconds },
    maxAttempts: { type: Number, default: DEFAULT_AUTO_CALLBACK_CONFIG.maxAttempts },
    retryDelayMinutes: {
      type: Number,
      default: DEFAULT_AUTO_CALLBACK_CONFIG.retryDelayMinutes,
    },
    cooldownMinutesPerCaller: {
      type: Number,
      default: DEFAULT_AUTO_CALLBACK_CONFIG.cooldownMinutesPerCaller,
    },
    maxCallbacksPerDay: { type: Number, default: DEFAULT_AUTO_CALLBACK_CONFIG.maxCallbacksPerDay },
    quietHours: {
      enabled: { type: Boolean, default: DEFAULT_AUTO_CALLBACK_CONFIG.quietHours.enabled },
      fromMinutes: { type: Number, default: DEFAULT_AUTO_CALLBACK_CONFIG.quietHours.fromMinutes },
      toMinutes: { type: Number, default: DEFAULT_AUTO_CALLBACK_CONFIG.quietHours.toMinutes },
      timezone: { type: String, default: DEFAULT_AUTO_CALLBACK_CONFIG.quietHours.timezone },
    },
  },
  { _id: false },
)

const phoneNumberSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    e164: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: '' },
    providerSlug: { type: String, default: 'sip_custom' },
    providerName: { type: String, default: '' },
    didRange: { type: String, default: '' },
    inboundEnabled: { type: Boolean, default: true },
    outboundEnabled: { type: Boolean, default: true },
    autoCallback: { type: autoCallbackSchema, default: () => ({}) },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    sipServer: { type: String, default: '' },
    sipPort: { type: Number, default: 5060 },
    sipProxy: { type: String, default: '' },
    sipRealm: { type: String, default: '' },
    sipUsername: { type: String, default: '' },
    sipAuthUsername: { type: String, default: '' },
    sipPassword: { type: String, select: false },
    sipPasswordSet: { type: Boolean, default: false },
    sipRegister: { type: Boolean, default: true },
    sipTransport: { type: String, enum: ['udp', 'tcp', 'tls'], default: 'udp' },
    sipCodecs: { type: String, default: 'PCMU@20ms' },
    status: { type: String, enum: ['active', 'pending', 'disabled'], default: 'active' },
  },
  { timestamps: true },
)

phoneNumberSchema.index({ orgId: 1, outboundEnabled: 1 })
phoneNumberSchema.index({ orgId: 1, inboundEnabled: 1 })

export type PhoneNumberDoc = InferSchemaType<typeof phoneNumberSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type PhoneNumberLean = PhoneNumberDoc

export const PhoneNumber: Model<PhoneNumberDoc> =
  (mongoose.models.PhoneNumber as Model<PhoneNumberDoc>) ||
  mongoose.model<PhoneNumberDoc>('PhoneNumber', phoneNumberSchema)
