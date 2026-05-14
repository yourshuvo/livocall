import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

/**
 * Append-only log of admin-visible actions. Written by mutation-handling
 * helpers. Not intended to capture read traffic.
 */
const auditLogSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorEmail: { type: String, index: true },
    // e.g. 'number.create', 'agent.update', 'member.invite'
    action: { type: String, required: true, index: true },
    // Resource type + optional id, e.g. { type: 'Agent', id: '...' }
    resource: {
      type: { type: String },
      id: { type: String },
    },
    // Arbitrary human-readable context. Keep small.
    meta: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
)

auditLogSchema.index({ orgId: 1, createdAt: -1 })

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type AuditLogLean = AuditLogDoc

export const AuditLog: Model<AuditLogDoc> =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ||
  mongoose.model<AuditLogDoc>('AuditLog', auditLogSchema)
