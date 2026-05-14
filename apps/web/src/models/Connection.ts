import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

export const CONNECTION_PLATFORMS = ['wordpress', 'shopify', 'zapier', 'make', 'n8n', 'rest'] as const
export type ConnectionPlatform = (typeof CONNECTION_PLATFORMS)[number]

const connectionSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    platform: { type: String, enum: CONNECTION_PLATFORMS, required: true, index: true },
    name: { type: String, required: true },
    siteUrl: { type: String, default: '' }, // WP site, Shopify store domain, etc.
    apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey', required: true },
    /**
     * Free-form per-platform config blob:
     *   wordpress: { syncContacts: bool, dncSync: bool }
     *   shopify:   { storeDomain: string, syncCustomers: bool, originateOnAbandonedCart: bool, agentId: string }
     *   zapier|make|n8n: { incomingWebhookUrl?: string }
     *   rest:      {}
     */
    config: { type: Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true },
    lastSyncAt: { type: Date },
    lastSyncStatus: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

export type ConnectionDoc = InferSchemaType<typeof connectionSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type ConnectionLean = ConnectionDoc

export const Connection: Model<ConnectionDoc> =
  (mongoose.models.Connection as Model<ConnectionDoc>) ||
  mongoose.model<ConnectionDoc>('Connection', connectionSchema)
