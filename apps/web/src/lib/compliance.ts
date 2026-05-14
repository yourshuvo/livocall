import { Call } from '@/models/Call'
import { DncEntry } from '@/models/DncEntry'
import { Org } from '@/models/Org'
import { AuditLog } from '@/models/AuditLog'

const OPT_OUT_PATTERNS = [
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bdo not call\b/i,
  /কল করবেন না/i,
  /আর ফোন করবেন না/i,
  /বন্ধ করুন/i,
]

const PHONE_PATTERN = /(\+?8801[3-9]\d{8}|01[3-9]\d{8})/g
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const NID_PATTERN = /\b\d{10,17}\b/g

interface ComplianceSettings {
  piiRedaction?: boolean | null
  detectOptOutSpeech?: boolean | null
  retentionDays?: number | null
  auditLogRetentionDays?: number | null
}

export function redactPii(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(PHONE_PATTERN, '[redacted-phone]')
    .replace(NID_PATTERN, '[redacted-id]')
}

export function hasOptOutSpeech(text: string): boolean {
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text))
}

export async function enforceTranscriptCompliance(callId: string) {
  const call = await Call.findById(callId)
  if (!call) return { redacted: false, optedOut: false }
  const org = await Org.findById(call.orgId).lean()
  const compliance: ComplianceSettings = org?.compliance || {}
  let redacted = false
  let optedOut = false
  if (compliance.piiRedaction !== false) {
    for (const turn of call.transcript || []) {
      const text = redactPii(turn.text)
      if (text !== turn.text) {
        turn.text = text
        redacted = true
      }
    }
    if (call.summary) {
      const summary = redactPii(call.summary)
      if (summary !== call.summary) redacted = true
      call.summary = summary
    }
  }
  if (compliance.detectOptOutSpeech !== false) {
    const saidOptOut = (call.transcript || []).some((turn) => turn.role === 'user' && hasOptOutSpeech(turn.text))
    if (saidOptOut) {
      optedOut = true
      await DncEntry.updateOne(
        { orgId: call.orgId, e164: call.fromE164 },
        {
          $setOnInsert: {
            orgId: call.orgId,
            e164: call.fromE164,
            reason: 'opt_out_keyword',
            note: 'Detected from call transcript',
            sourceCallId: call._id,
          },
        },
        { upsert: true },
      )
    }
  }
  if (redacted || optedOut) {
    call.metadata = {
      ...(call.metadata || {}),
      compliance: {
        ...((call.metadata || {}).compliance || {}),
        piiRedacted: redacted || Boolean((call.metadata || {}).compliance?.piiRedacted),
        optOutDetected: optedOut || Boolean((call.metadata || {}).compliance?.optOutDetected),
      },
    }
    await call.save()
  }
  return { redacted, optedOut }
}

export async function runComplianceRetention() {
  const orgs = await Org.find({}).lean()
  let deletedCalls = 0
  let deletedAuditLogs = 0
  for (const org of orgs) {
    const retentionDays = Number(org.compliance?.retentionDays ?? 365)
    const auditRetentionDays = Number(org.compliance?.auditLogRetentionDays ?? 730)
    const callCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    const auditCutoff = new Date(Date.now() - auditRetentionDays * 24 * 60 * 60 * 1000)
    const callResult = await Call.deleteMany({ orgId: org._id, endedAt: { $lt: callCutoff } })
    const auditResult = await AuditLog.deleteMany({ orgId: org._id, createdAt: { $lt: auditCutoff } })
    deletedCalls += callResult.deletedCount || 0
    deletedAuditLogs += auditResult.deletedCount || 0
  }
  return { deletedCalls, deletedAuditLogs }
}
