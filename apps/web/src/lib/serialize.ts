/**
 * Convert Mongoose lean docs to JSON-safe DTOs the dashboard / public API can
 * return without leaking ObjectId / Date / Map types.
 */

import type { AgentLean } from '@/models/Agent'
import type { CallLean } from '@/models/Call'
import type { PhoneNumberLean } from '@/models/PhoneNumber'
import type { KnowledgeBaseLean } from '@/models/KnowledgeBase'
import type { ApiKeyLean } from '@/models/ApiKey'
import type { WebhookLean } from '@/models/Webhook'
import type { LedgerEntryLean } from '@/models/LedgerEntry'
import type { CampaignLean } from '@/models/Campaign'
import type { ContactLean } from '@/models/Contact'
import type { DncEntryLean } from '@/models/DncEntry'
import type { OrgLean } from '@/models/Org'
import type { UserDoc } from '@/models/User'
import type { SecretLean } from '@/models/Secret'
import { normalizeAutoCallbackConfig } from '@/lib/auto-callback'

const id = (v: unknown) => (v ? String(v) : null)
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null)

export function agentToJson(a: AgentLean) {
  return {
    id: id(a._id),
    orgId: id(a.orgId),
    name: a.name,
    description: a.description,
    tier: a.tier,
    model: a.model ?? '',
    language: a.language,
    voice: a.voice,
    prompt: a.prompt,
    dtmf: a.dtmf
      ? {
          menu: (a.dtmf.menu ?? []).map((m) => ({
            key: m.key,
            label: m.label ?? '',
            action: m.action ?? '',
          })),
          maxAttempts: a.dtmf.maxAttempts ?? 3,
          interDigitTimeoutMs: a.dtmf.interDigitTimeoutMs ?? 2500,
          terminator: a.dtmf.terminator ?? '#',
          noInputPromptUrl: a.dtmf.noInputPromptUrl ?? '',
        }
      : {
          menu: [],
          maxAttempts: 3,
          interDigitTimeoutMs: 2500,
          terminator: '#',
          noInputPromptUrl: '',
        },
    tools: (a.tools || []).map((t) => ({
      name: String(t.name ?? ''),
      description: String(t.description ?? ''),
      method: String(t.method ?? 'POST'),
      url: String(t.url ?? ''),
      headers: t.headers ?? {},
      authHeader: String(t.authHeader ?? ''),
      authValue: '',
      secretId: t.secretId ? id(t.secretId) : null,
      authValueSet: Boolean(t.authValueSet),
      allowedDomains: t.allowedDomains ?? [],
      retries: Number(t.retries ?? 1),
      timeoutMs: Number(t.timeoutMs ?? 5000),
      enabled: t.enabled !== false,
    })),
    knowledgeBaseIds: (a.knowledgeBaseIds || []).map(id),
    postCallWebhook: a.postCallWebhook,
    runtimeSettings: a.runtimeSettings ?? {},
    geminiMemory: a.geminiMemory
      ? {
          status: a.geminiMemory.status ?? 'stale',
          updatedAt: iso(a.geminiMemory.updatedAt),
          cacheExpiresAt: iso(a.geminiMemory.cacheExpiresAt),
        }
      : null,
    outcomeConfig: a.outcomeConfig ?? null,
    status: a.status,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  }
}

export function callToJson(c: CallLean) {
  return {
    id: id(c._id),
    orgId: id(c.orgId),
    agentId: id(c.agentId),
    direction: c.direction,
    fromE164: c.fromE164,
    toE164: c.toE164,
    tier: c.tier,
    startedAt: iso(c.startedAt),
    endedAt: iso(c.endedAt),
    durationSec: c.durationSec,
    audioUrl: c.audioUrl ?? null,
    transcript: (c.transcript ?? []).map((t) => ({
      role: t.role,
      text: t.text,
      at: iso(t.at),
    })),
    cost: c.cost,
    outcome: c.outcome,
    businessOutcome: c.businessOutcome
      ? {
          key: c.businessOutcome.key ?? '',
          label: c.businessOutcome.label ?? '',
          confidence: c.businessOutcome.confidence ?? 0,
          conversion: Boolean(c.businessOutcome.conversion),
          amountPaisa: c.businessOutcome.amountPaisa ?? 0,
          callbackAt: iso(c.businessOutcome.callbackAt),
          callbackE164: c.businessOutcome.callbackE164 ?? null,
          notes: c.businessOutcome.notes ?? '',
          extractedAt: iso(c.businessOutcome.extractedAt),
        }
      : null,
    sentiment: c.sentiment ?? null,
    summary: c.summary ?? null,
    dtmfPath: c.dtmfPath ?? null,
    toolCalls: (c.toolCalls ?? []).map((t) => ({
      name: t.name,
      arguments: t.arguments ?? {},
      result: t.result ?? {},
      ok: t.ok,
      startedAt: t.startedAt ?? null,
      endedAt: t.endedAt ?? null,
    })),
    ivrEvents: c.ivrEvents ?? [],
    supervisorEvents: c.supervisorEvents ?? [],
    edgeUuid: c.edgeUuid ?? null,
    hangupCause: c.hangupCause ?? null,
    metadata: c.metadata ?? {},
    latency: c.latency ?? {},
  }
}

export function phoneNumberToJson(p: PhoneNumberLean) {
  return {
    id: id(p._id),
    orgId: id(p.orgId),
    e164: p.e164,
    providerSlug: p.providerSlug,
    providerName: p.providerName ?? '',
    didRange: p.didRange,
    sipServer: p.sipServer ?? '',
    sipPort: p.sipPort ?? 5060,
    sipProxy: p.sipProxy ?? '',
    sipRealm: p.sipRealm ?? '',
    sipUsername: p.sipUsername ?? '',
    sipAuthUsername: p.sipAuthUsername ?? '',
    sipPasswordSet: Boolean(p.sipPasswordSet),
    sipRegister: p.sipRegister ?? true,
    sipTransport: p.sipTransport ?? 'udp',
    sipCodecs: p.sipCodecs ?? 'PCMU@20ms',
    agentId: p.agentId ? id(p.agentId) : null,
    inboundEnabled: p.inboundEnabled,
    outboundEnabled: p.outboundEnabled,
    autoCallback: normalizeAutoCallbackConfig(p.autoCallback),
    createdAt: iso(p.createdAt),
  }
}

export function kbToJson(k: KnowledgeBaseLean) {
  return {
    id: id(k._id),
    name: k.name,
    sources: k.sources,
    embeddingNamespace: k.embeddingNamespace,
    quality: k.quality ?? null,
    createdAt: iso(k.createdAt),
    updatedAt: iso(k.updatedAt),
  }
}

export function apiKeyToJson(k: ApiKeyLean, plaintext?: string) {
  return {
    id: id(k._id),
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    lastUsedAt: iso(k.lastUsedAt),
    revokedAt: iso(k.revokedAt),
    createdAt: iso(k.createdAt),
    plaintext: plaintext ?? null, // only populated on creation
  }
}

export function secretToJson(s: SecretLean) {
  return {
    id: id(s._id),
    name: s.name,
    kind: s.kind,
    provider: s.provider ?? '',
    fingerprint: s.fingerprint,
    version: s.version ?? 1,
    rotatedAt: iso(s.rotatedAt),
    lastUsedAt: iso(s.lastUsedAt),
    revokedAt: iso(s.revokedAt),
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  }
}

export function webhookToJson(w: WebhookLean, includeSecret = false) {
  return {
    id: id(w._id),
    url: w.url,
    events: w.events,
    description: w.description,
    active: w.active,
    secret: includeSecret ? w.secret : null,
    lastDeliveryAt: iso(w.lastDeliveryAt),
    lastDeliveryStatus: w.lastDeliveryStatus ?? null,
    failureCount: w.failureCount,
    createdAt: iso(w.createdAt),
  }
}

export function ledgerToJson(l: LedgerEntryLean) {
  return {
    id: id(l._id),
    kind: l.kind,
    amountPaisa: l.amountPaisa,
    balanceAfterPaisa: l.balanceAfterPaisa,
    description: l.description,
    callId: l.callId ? id(l.callId) : null,
    provider: l.provider,
    providerRef: l.providerRef,
    createdAt: iso(l.createdAt),
  }
}

export function campaignToJson(c: CampaignLean) {
  return {
    id: id(c._id),
    name: c.name,
    description: c.description,
    agentId: id(c.agentId),
    contactIds: (c.contactIds || []).map(id),
    schedule: c.schedule,
    concurrency: c.concurrency,
    maxAttempts: c.maxAttempts,
    retryRules: c.retryRules,
    leadScoring: c.leadScoring,
    autoStopGoals: c.autoStopGoals,
    fromE164: c.fromE164,
    status: c.status,
    stats: c.stats,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  }
}

export function contactToJson(c: ContactLean) {
  const attrs: Record<string, string> = {}
  const raw = c.attrs as unknown
  if (raw instanceof Map) {
    raw.forEach((v, k) => {
      attrs[String(k)] = String(v)
    })
  } else if (raw && typeof raw === 'object') {
    Object.assign(attrs, raw as Record<string, string>)
  }
  return {
    id: id(c._id),
    e164: c.e164,
    name: c.name,
    locale: c.locale,
    attrs,
    tags: c.tags,
    createdAt: iso(c.createdAt),
  }
}

export function dncToJson(d: DncEntryLean) {
  return {
    id: id(d._id),
    e164: d.e164,
    reason: d.reason,
    note: d.note,
    sourceCallId: d.sourceCallId ? id(d.sourceCallId) : null,
    createdAt: iso(d.createdAt),
  }
}

export function orgToJson(o: OrgLean) {
  return {
    id: id(o._id),
    name: o.name,
    slug: o.slug,
    plan: o.plan,
    creditsPaisa: o.creditsPaisa,
    btrcDisclosure: o.btrcDisclosure,
    recordingConsent: o.recordingConsent ?? 'optional',
    btrcDisclosureAudioUrl: o.btrcDisclosureAudioUrl ?? '',
    dailySpendCapPaisa: o.dailySpendCapPaisa ?? 0,
    monthlySpendCapPaisa: o.monthlySpendCapPaisa ?? 0,
    compliance: o.compliance ?? {
      piiRedaction: true,
      detectOptOutSpeech: true,
      retentionDays: 365,
      auditLogRetentionDays: 730,
      agentRoleCanExport: false,
    },
    createdAt: iso(o.createdAt),
  }
}

export function userToJson(u: UserDoc) {
  return {
    id: id(u._id),
    email: u.email,
    name: u.name,
    orgId: id(u.orgId),
    role: u.role,
    locale: u.locale,
  }
}
