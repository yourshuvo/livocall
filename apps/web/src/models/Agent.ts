import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'
import { agentLanguageCodes } from '@/types/agent'

const runtimeSettingsSchema = new Schema(
  {
    welcomeMode: { type: String, enum: ['ai', 'caller', 'silent'], default: 'ai' },
    welcomeKind: { type: String, enum: ['dynamic', 'static'], default: 'dynamic' },
    pauseBeforeSpeakingSec: { type: Number, default: 0 },
    denoiseMode: { type: String, enum: ['none', 'mixed', 'off'], default: 'none' },
    transcriptionMode: { type: String, enum: ['speed', 'accuracy', 'custom'], default: 'speed' },
    sttProvider: { type: String, enum: ['soniox', 'deepgram'], default: 'soniox' },
    vocabularyMode: { type: String, enum: ['general', 'medical'], default: 'general' },
    boostedKeywords: { type: String, default: '' },
    voicemailDetection: { type: Boolean, default: false },
    ivrHangup: { type: Boolean, default: false },
    keypadInput: { type: Boolean, default: true },
    keypadTimeoutSec: { type: Number, default: 2.5 },
    terminationKey: { type: Boolean, default: false },
    digitLimit: { type: Boolean, default: false },
    endSilenceMin: { type: Number, default: 10 },
    maxDurationHours: { type: Number, default: 1 },
    handoffTarget: { type: String, default: '' },
    handoffRules: { type: String, default: '' },
    geminiLiveVadSilenceMs: { type: Number, default: 250 },
    geminiKbToolTimeoutMs: { type: Number, default: 1200 },
    geminiMemoryEnabled: { type: Boolean, default: true },
    geminiKbCacheEnabled: { type: Boolean, default: true },
  },
  { _id: false },
)

const geminiMemorySchema = new Schema(
  {
    status: {
      type: String,
      enum: ['ready', 'stale', 'failed', 'unsupported'],
      default: 'stale',
    },
    text: { type: String, default: '' },
    sourceHash: { type: String, default: '' },
    updatedAt: { type: Date },
    cacheName: { type: String, default: '' },
    cacheModel: { type: String, default: '' },
    cacheExpiresAt: { type: Date },
    error: { type: String, default: '' },
  },
  { _id: false },
)

const outcomeLabelSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    conversion: { type: Boolean, default: false },
  },
  { _id: false },
)

const DEFAULT_OUTCOME_LABELS = [
  {
    key: 'interested',
    label: 'Interested',
    description: 'Caller showed buying intent or asked for next steps.',
    conversion: true,
  },
  {
    key: 'not_interested',
    label: 'Not interested',
    description: 'Caller declined the offer or asked not to proceed.',
    conversion: false,
  },
  {
    key: 'callback_requested',
    label: 'Callback requested',
    description: 'Caller asked to be contacted later.',
    conversion: false,
  },
  {
    key: 'purchased',
    label: 'Purchased',
    description: 'Caller confirmed an order, payment, booking, or purchase.',
    conversion: true,
  },
  {
    key: 'complaint',
    label: 'Complaint',
    description: 'Caller raised a complaint, escalation, refund, or service issue.',
    conversion: false,
  },
  {
    key: 'wrong_number',
    label: 'Wrong number',
    description: 'Caller said this is the wrong person or number.',
    conversion: false,
  },
  {
    key: 'unknown',
    label: 'Unknown',
    description: 'Outcome cannot be confidently determined.',
    conversion: false,
  },
]

const outcomeConfigSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    labels: {
      type: [outcomeLabelSchema],
      default: () => DEFAULT_OUTCOME_LABELS.map((label) => ({ ...label })),
    },
  },
  { _id: false },
)

const agentSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    tier: {
      type: String,
      enum: ['gemini_live', 'grok_voice', 'pipeline', 'dtmf'],
      required: true,
      default: 'pipeline',
    },
    language: {
      type: String,
      enum: agentLanguageCodes,
      default: 'bn',
    },
    // Engine-specific model identifier. Tier defines the *family* (pipeline /
    // gemini_live / grok_voice / dtmf); `model` selects the concrete variant
    // (e.g. gpt-4.1, grok-voice-think-fast-1.0). Empty string means "use the tier
    // default" — the voice service falls back accordingly.
    model: { type: String, default: '' },
    voice: {
      provider: { type: String, default: 'soniox' },
      voiceId: { type: String, default: 'Adrian' },
      style: { type: String, default: 'conversational' },
    },
    prompt: {
      system: { type: String, default: '' },
      firstMessage: { type: String, default: '' },
      guardrails: { type: String, default: '' },
    },
    // DTMF-specific configuration. Only relevant when tier='dtmf'; ignored by
    // other tiers. The voice service reads this to drive its IVR menu.
    dtmf: {
      menu: {
        type: [
          {
            key: { type: String, required: true },
            label: { type: String, default: '' },
            action: { type: String, default: '' },
          },
        ],
        default: [],
      },
      maxAttempts: { type: Number, default: 3 },
      interDigitTimeoutMs: { type: Number, default: 2500 },
      terminator: { type: String, default: '#' },
      noInputPromptUrl: { type: String, default: '' },
    },
    tools: {
      type: [
        {
          name: { type: String, required: true },
          description: { type: String, default: '' },
          method: {
            type: String,
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            default: 'POST',
          },
          url: { type: String, required: true },
          headers: { type: Schema.Types.Mixed, default: {} },
          authHeader: { type: String, default: '' },
          authValue: { type: String, default: '', select: false },
          secretId: { type: Schema.Types.ObjectId, ref: 'Secret' },
          authValueSet: { type: Boolean, default: false },
          allowedDomains: { type: [String], default: [] },
          retries: { type: Number, default: 1 },
          timeoutMs: { type: Number, default: 5000 },
          enabled: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    knowledgeBaseIds: [{ type: Schema.Types.ObjectId, ref: 'KnowledgeBase' }],
    postCallWebhook: { type: String, default: '' },
    runtimeSettings: { type: runtimeSettingsSchema, default: () => ({}) },
    geminiMemory: { type: geminiMemorySchema, default: () => ({}) },
    outcomeConfig: { type: outcomeConfigSchema, default: () => ({}) },
    status: { type: String, enum: ['draft', 'live'], default: 'draft' },
  },
  { timestamps: true },
)

export type AgentDoc = InferSchemaType<typeof agentSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type AgentLean = Omit<AgentDoc, '_id'> & { _id: mongoose.Types.ObjectId }

export const Agent: Model<AgentDoc> =
  (mongoose.models.Agent as Model<AgentDoc>) || mongoose.model<AgentDoc>('Agent', agentSchema)
