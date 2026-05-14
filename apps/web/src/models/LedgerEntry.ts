import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

export const LEDGER_KINDS = ['topup', 'usage', 'refund', 'adjustment'] as const

export type LedgerKind = (typeof LEDGER_KINDS)[number]

const ledgerSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    kind: { type: String, enum: LEDGER_KINDS, required: true },
    // signed paisa: positive for credits (topups, refunds), negative for usage
    amountPaisa: { type: Number, required: true },
    balanceAfterPaisa: { type: Number, default: 0 }, // 0 for pending provider rows
    description: { type: String, default: '' },
    callId: { type: Schema.Types.ObjectId, ref: 'Call' },
    provider: { type: String, default: '' }, // 'paystation' or other ledger source
    providerRef: { type: String, default: '' }, // external txn id
    meta: { type: Schema.Types.Mixed, default: {} }, // provider-specific extras
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

ledgerSchema.index({ orgId: 1, createdAt: -1 })

export type LedgerEntryDoc = InferSchemaType<typeof ledgerSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export type LedgerEntryLean = LedgerEntryDoc

export const LedgerEntry: Model<LedgerEntryDoc> =
  (mongoose.models.LedgerEntry as Model<LedgerEntryDoc>) ||
  mongoose.model<LedgerEntryDoc>('LedgerEntry', ledgerSchema)
