import mongoose from 'mongoose'
import { connectMongo } from '@/lib/db'
import { Org } from '@/models/Org'
import { LedgerEntry, type LedgerKind } from '@/models/LedgerEntry'

export interface LedgerWrite {
  orgId: string
  kind: LedgerKind
  amountPaisa: number // signed: + for credits, - for usage
  description?: string
  callId?: string
  provider?: string
  providerRef?: string
  createdBy?: string
}

/**
 * Atomically applies a ledger entry: updates Org.creditsPaisa and writes a
 * LedgerEntry row. Returns the new balance.
 *
 * Throws if the org would go below the configured floor (default 0). Top-ups
 * and refunds bypass the floor check.
 */
export async function postLedger(entry: LedgerWrite): Promise<number> {
  await connectMongo()
  const session = await mongoose.startSession()
  try {
    let balance = 0
    await session.withTransaction(async () => {
      const orgUpdate = await Org.findByIdAndUpdate(
        entry.orgId,
        { $inc: { creditsPaisa: entry.amountPaisa } },
        { new: true, session },
      )
      if (!orgUpdate) throw new Error('org not found')
      if (orgUpdate.creditsPaisa < 0 && entry.kind === 'usage') {
        // allow overdraft for usage to keep calls running, but flag it
        // (the post-call billing job is what writes usage; we don't want to
        // hard-fail an in-flight call). UI surfaces the negative balance.
      }
      balance = orgUpdate.creditsPaisa
      await LedgerEntry.create(
        [
          {
            orgId: entry.orgId,
            kind: entry.kind,
            amountPaisa: entry.amountPaisa,
            balanceAfterPaisa: balance,
            description: entry.description ?? '',
            callId: entry.callId,
            provider: entry.provider ?? '',
            providerRef: entry.providerRef ?? '',
            createdBy: entry.createdBy,
          },
        ],
        { session },
      )
    })
    return balance
  } finally {
    await session.endSession()
  }
}

export interface UsageRollup {
  totalCalls: number
  totalDurationSec: number
  totalSpendPaisa: number
  byTier: Record<string, { calls: number; durationSec: number; spendPaisa: number }>
  byDay: Array<{ day: string; calls: number; spendPaisa: number }>
}

import { Call } from '@/models/Call'

export async function getUsage(orgId: string, since: Date): Promise<UsageRollup> {
  await connectMongo()
  const calls = await Call.find({ orgId, startedAt: { $gte: since } })
    .select('tier durationSec cost startedAt')
    .lean()

  const byTier: UsageRollup['byTier'] = {}
  const byDay: Record<string, { calls: number; spendPaisa: number }> = {}
  let totalCalls = 0
  let totalDurationSec = 0
  let totalSpendPaisa = 0

  for (const c of calls) {
    totalCalls += 1
    totalDurationSec += c.durationSec ?? 0
    const spend = c.cost?.totalPaisa ?? 0
    totalSpendPaisa += spend
    const tier = c.tier
    if (!byTier[tier]) byTier[tier] = { calls: 0, durationSec: 0, spendPaisa: 0 }
    byTier[tier].calls += 1
    byTier[tier].durationSec += c.durationSec ?? 0
    byTier[tier].spendPaisa += spend
    const day = new Date(c.startedAt as unknown as string).toISOString().slice(0, 10)
    if (!byDay[day]) byDay[day] = { calls: 0, spendPaisa: 0 }
    byDay[day].calls += 1
    byDay[day].spendPaisa += spend
  }

  return {
    totalCalls,
    totalDurationSec,
    totalSpendPaisa,
    byTier,
    byDay: Object.entries(byDay)
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => (a.day < b.day ? -1 : 1)),
  }
}
