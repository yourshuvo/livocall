/**
 * Spend caps live on the Org (daily + monthly, in paisa). This helper returns
 * how much the org has spent in the relevant windows so API handlers can
 * refuse to originate a new call once the cap is reached. 0 = no cap.
 */

import { connectMongo } from '@/lib/db'
import { LedgerEntry } from '@/models/LedgerEntry'
import { Org, type OrgLean } from '@/models/Org'
import { Types } from 'mongoose'

export interface CapSnapshot {
  spentTodayPaisa: number
  spentThisMonthPaisa: number
  dailyCapPaisa: number
  monthlyCapPaisa: number
  dailyExceeded: boolean
  monthlyExceeded: boolean
}

export interface OriginationGuard {
  ok: boolean
  reason?: string
  org?: OrgLean
  caps?: CapSnapshot
}

function startOfUtcDay(d = new Date()): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function startOfUtcMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export async function getCapSnapshot(
  orgId: string,
  dailyCapPaisa: number,
  monthlyCapPaisa: number,
): Promise<CapSnapshot> {
  await connectMongo()
  const orgObjectId = Types.ObjectId.isValid(orgId) ? new Types.ObjectId(orgId) : orgId
  // LedgerEntry.amountPaisa is signed (negative for usage). Sum absolute usage
  // debits in each window.
  const usageMatch = (since: Date) => ({
    orgId: orgObjectId,
    kind: 'usage',
    createdAt: { $gte: since },
  })
  const [todayAgg, monthAgg] = await Promise.all([
    LedgerEntry.aggregate([
      { $match: usageMatch(startOfUtcDay()) },
      { $group: { _id: null, sum: { $sum: '$amountPaisa' } } },
    ]),
    LedgerEntry.aggregate([
      { $match: usageMatch(startOfUtcMonth()) },
      { $group: { _id: null, sum: { $sum: '$amountPaisa' } } },
    ]),
  ])
  // Usage entries are negative; convert to positive spent amount.
  const spentTodayPaisa = Math.abs(todayAgg[0]?.sum ?? 0)
  const spentThisMonthPaisa = Math.abs(monthAgg[0]?.sum ?? 0)
  return {
    spentTodayPaisa,
    spentThisMonthPaisa,
    dailyCapPaisa,
    monthlyCapPaisa,
    dailyExceeded: dailyCapPaisa > 0 && spentTodayPaisa >= dailyCapPaisa,
    monthlyExceeded: monthlyCapPaisa > 0 && spentThisMonthPaisa >= monthlyCapPaisa,
  }
}

export async function getOriginationGuard(orgId: string): Promise<OriginationGuard> {
  await connectMongo()
  const org = await Org.findById(orgId).lean<OrgLean>()
  if (!org) return { ok: false, reason: 'org not found' }
  if (org.creditsPaisa <= 0) return { ok: false, org, reason: 'insufficient credits - top up the org' }

  const caps = await getCapSnapshot(
    String(org._id),
    org.dailySpendCapPaisa ?? 0,
    org.monthlySpendCapPaisa ?? 0,
  )
  if (caps.dailyExceeded) return { ok: false, org, caps, reason: 'daily spend cap reached' }
  if (caps.monthlyExceeded) return { ok: false, org, caps, reason: 'monthly spend cap reached' }
  return { ok: true, org, caps }
}
