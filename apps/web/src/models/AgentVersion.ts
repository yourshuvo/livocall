import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const agentVersionSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    label: { type: String, default: '' },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
)

agentVersionSchema.index({ orgId: 1, agentId: 1, createdAt: -1 })

export type AgentVersionDoc = InferSchemaType<typeof agentVersionSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type AgentVersionLean = AgentVersionDoc

export const AgentVersion: Model<AgentVersionDoc> =
  (mongoose.models.AgentVersion as Model<AgentVersionDoc>) ||
  mongoose.model<AgentVersionDoc>('AgentVersion', agentVersionSchema)
