import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

export const WEBHOOK_EVENTS = [
  'call.started',
  'call.completed',
  'call.failed',
  'call.transferred',
  'agent.updated',
  'topup.confirmed',
  'campaign.completed',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

const webhookSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    url: { type: String, required: true },
    events: {
      type: [String],
      enum: WEBHOOK_EVENTS,
      default: ['call.completed', 'call.failed'],
    },
    secret: { type: String, required: true }, // shared with consumer to verify HMAC
    active: { type: Boolean, default: true },
    description: { type: String, default: '' },
    lastDeliveryAt: { type: Date },
    lastDeliveryStatus: { type: Number },
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export type WebhookDoc = InferSchemaType<typeof webhookSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type WebhookLean = WebhookDoc

export const Webhook: Model<WebhookDoc> =
  (mongoose.models.Webhook as Model<WebhookDoc>) ||
  mongoose.model<WebhookDoc>('Webhook', webhookSchema)
