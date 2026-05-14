import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const deliverySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', index: true },
    url: { type: String },
    secret: { type: String },
    event: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastStatus: { type: Number },
    lastError: { type: String },
    deliveredAt: { type: Date },
    deadAt: { type: Date }, // moved to dead-letter after max retries
  },
  { timestamps: true },
)

export type WebhookDeliveryDoc = InferSchemaType<typeof deliverySchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type WebhookDeliveryLean = WebhookDeliveryDoc

export const WebhookDelivery: Model<WebhookDeliveryDoc> =
  (mongoose.models.WebhookDelivery as Model<WebhookDeliveryDoc>) ||
  mongoose.model<WebhookDeliveryDoc>('WebhookDelivery', deliverySchema)
