import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const turnSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'agent', 'system'], required: true },
    text: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
)

const toolCallSchema = new Schema(
  {
    name: { type: String, required: true },
    arguments: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed, default: {} },
    ok: { type: Boolean, default: false },
    startedAt: { type: String },
    endedAt: { type: String },
  },
  { _id: false },
)

const supervisorEventSchema = new Schema(
  {
    action: { type: String, enum: ['listen', 'whisper', 'barge'], required: true },
    supervisorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    ok: { type: Boolean, default: false },
    streamUrl: { type: String, default: '' },
    targetE164: { type: String, default: '' },
    supervisorLegUuid: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  { _id: false },
)

const businessOutcomeSchema = new Schema(
  {
    key: { type: String, default: '' },
    label: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
    conversion: { type: Boolean, default: false },
    amountPaisa: { type: Number, default: 0 },
    callbackAt: { type: Date },
    callbackE164: { type: String, default: '' },
    notes: { type: String, default: '' },
    extractedAt: { type: Date },
  },
  { _id: false },
)

const callSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    fromE164: { type: String, required: true },
    toE164: { type: String, required: true },
    tier: {
      type: String,
      enum: ['gemini_live', 'grok_voice', 'pipeline', 'dtmf'],
      required: true,
    },
    startedAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date },
    durationSec: { type: Number, default: 0 },
    audioUrl: { type: String },
    transcript: { type: [turnSchema], default: [] },
    cost: {
      sttPaisa: { type: Number, default: 0 },
      llmPaisa: { type: Number, default: 0 },
      ttsPaisa: { type: Number, default: 0 },
      sipPaisa: { type: Number, default: 0 },
      totalPaisa: { type: Number, default: 0 },
    },
    outcome: {
      type: String,
      enum: ['completed', 'no_answer', 'busy', 'failed', 'voicemail', 'in_progress'],
      default: 'in_progress',
    },
    businessOutcome: { type: businessOutcomeSchema },
    sentiment: { type: String },
    summary: { type: String },
    dtmfPath: { type: String },
    toolCalls: { type: [toolCallSchema], default: [] },
    ivrEvents: { type: [Schema.Types.Mixed], default: [] },
    supervisorEvents: { type: [supervisorEventSchema], default: [] },
    fsUuid: { type: String },
    hangupCause: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    latency: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

callSchema.index({ orgId: 1, startedAt: -1 })
callSchema.index({ orgId: 1, outcome: 1, startedAt: -1 })
callSchema.index({ fsUuid: 1 })

export type CallDoc = InferSchemaType<typeof callSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type CallLean = CallDoc

export const Call: Model<CallDoc> =
  (mongoose.models.Call as Model<CallDoc>) || mongoose.model<CallDoc>('Call', callSchema)
