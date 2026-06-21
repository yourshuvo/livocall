import crypto from 'node:crypto'
import { Types } from 'mongoose'
import { signWebhook, verifyWebhook, randomToken } from '@/lib/hmac'
import { encryptSecretValue, decryptSecretValue } from '@/lib/secret-vault'
import { Connection, type ConnectionDoc, type ConnectionLean } from '@/models/Connection'
import { Call, type CallDoc } from '@/models/Call'

export const WORDPRESS_SIGNATURE_HEADER = 'livocall-signature'
export const WORDPRESS_TOKEN_TTL_DAYS = 7
export const WORDPRESS_OAUTH_CODE_TTL_MINUTES = 10

const REDACTED = '[redacted]'
const SENSITIVE_KEY = /(password|pass|pin|otp|secret|token|authorization|cookie|card|cvv|cvc|nonce)/i
const MAX_STRING = 500
const MAX_FIELDS = 120

export interface WordPressFieldToken {
  token: string
  path: string
  label: string
  source: string
  sample?: string
  type: 'string' | 'number' | 'boolean'
}

export interface WordPressSample {
  kind: string
  sample: unknown
}

export interface WordPressContactInput {
  e164?: string
  phone?: string
  name?: string
  email?: string
  locale?: 'bn' | 'en' | 'mixed'
  tags?: string[]
  attrs?: Record<string, unknown>
}

export interface WordPressConfig {
  registrationTokenHash?: string
  registrationTokenExpiresAt?: string
  registeredAt?: string
  oauthStartedAt?: string
  oauthConnectedAt?: string
  connectionMode?: 'token' | 'oauth'
  signingSecretCiphertext?: string
  siteName?: string
  pluginVersion?: string
  capabilities?: Record<string, unknown>
  fields?: WordPressFieldToken[]
  samples?: Array<{ kind: string; receivedAt: string; sample: unknown }>
}

export interface DtmfMenuItemLike {
  key?: string
  label?: string
  action?: string
  actionType?: string
  actionConfig?: Record<string, unknown>
}

export function hashWordPressToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function createWordPressRegistration() {
  const token = randomToken('lvo_wpconn_', 18)
  const expires = new Date(Date.now() + WORDPRESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  return {
    token,
    config: {
      registrationTokenHash: hashWordPressToken(token),
      registrationTokenExpiresAt: expires.toISOString(),
      registeredAt: '',
      capabilities: {},
      fields: [],
      samples: [],
    } satisfies WordPressConfig,
  }
}

export function createWordPressSigningSecret(): string {
  return randomToken('lvo_wpsec_', 32)
}

export function createWordPressOAuthCode(): string {
  return randomToken('lvo_wpoauth_', 24)
}

export function hashWordPressOAuthCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export function pkceChallengeForVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export function verifyPkceChallenge(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  const expected = pkceChallengeForVerifier(verifier)
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(challenge))
  } catch {
    return false
  }
}

export function wordpressOAuthExpiresAt(now = Date.now()): Date {
  return new Date(now + WORDPRESS_OAUTH_CODE_TTL_MINUTES * 60 * 1000)
}

export function validateWordPressOAuthRedirect(params: {
  siteUrl: string
  callbackUrl: string
}): { ok: true; site: URL; callback: URL } | { ok: false; error: string } {
  let site: URL
  let callback: URL
  try {
    site = new URL(params.siteUrl)
    callback = new URL(params.callbackUrl)
  } catch {
    return { ok: false, error: 'siteUrl and callbackUrl must be valid URLs' }
  }
  if (!['http:', 'https:'].includes(site.protocol) || !['http:', 'https:'].includes(callback.protocol)) {
    return { ok: false, error: 'siteUrl and callbackUrl must use http or https' }
  }
  if (site.hostname.toLowerCase() !== callback.hostname.toLowerCase()) {
    return { ok: false, error: 'callbackUrl must use the same host as siteUrl' }
  }
  return { ok: true, site, callback }
}

export function wordpressConfig(config: unknown): WordPressConfig {
  const root = config && typeof config === 'object' ? (config as Record<string, unknown>) : {}
  const wp = root.wordpress
  return wp && typeof wp === 'object' ? (wp as WordPressConfig) : {}
}

export function withWordPressConfig(config: unknown, patch: Partial<WordPressConfig>) {
  const root = config && typeof config === 'object' ? { ...(config as Record<string, unknown>) } : {}
  root.wordpress = { ...wordpressConfig(root), ...patch }
  return root
}

export function encryptWordPressSigningSecret(secret: string): string {
  return encryptSecretValue(secret)
}

export function decryptWordPressSigningSecret(config: unknown): string {
  const cipher = wordpressConfig(config).signingSecretCiphertext || ''
  return cipher ? decryptSecretValue(cipher) : ''
}

export function verifyWordPressRequest(
  connection: ConnectionDoc | ConnectionLean,
  rawBody: string,
  header: string,
): boolean {
  const secret = decryptWordPressSigningSecret(connection.config)
  return Boolean(secret && verifyWebhook(secret, rawBody, header))
}

export async function signedWordPressConnection(
  connectionId: string,
  rawBody: string,
  header: string,
) {
  if (!Types.ObjectId.isValid(connectionId)) return null
  const connection = await Connection.findOne({
    _id: connectionId,
    platform: 'wordpress',
    active: true,
  })
  if (!connection || !verifyWordPressRequest(connection, rawBody, header)) return null
  return connection
}

export function sanitizeWordPressPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[max_depth]'
  if (value == null) return value
  if (typeof value === 'string') return value.slice(0, MAX_STRING)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeWordPressPayload(item, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeWordPressPayload(raw, depth + 1)
    }
    return out
  }
  return String(value).slice(0, MAX_STRING)
}

export function sanitizeWordPressContactAttrs(attrs: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!attrs || typeof attrs !== 'object') return out
  for (const [rawKey, rawValue] of Object.entries(attrs as Record<string, unknown>).slice(0, 80)) {
    const key = rawKey
      .replace(/^\$+/, '')
      .replace(/[.$]/g, '_')
      .replace(/[^A-Za-z0-9_:-]/g, '_')
      .slice(0, 80)
    if (!key || SENSITIVE_KEY.test(key)) continue
    if (rawValue == null) continue
    if (typeof rawValue === 'object') continue
    out[key] = String(rawValue).slice(0, 300)
  }
  return out
}

export function normalizeWordPressContactTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return ['wordpress']
  const clean = tags
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean)
    .map((tag) => tag.replace(/[^a-z0-9:_-]/g, '-').slice(0, 48))
  return [...new Set(['wordpress', ...clean])].slice(0, 20)
}

export function buildWordPressFieldCatalog(samples: WordPressSample[]): WordPressFieldToken[] {
  const seen = new Map<string, WordPressFieldToken>()
  for (const sample of samples) {
    const sanitized = sanitizeWordPressPayload(sample.sample)
    collectFields(sanitized, '', sample.kind || 'wordpress', seen)
    if (seen.size >= MAX_FIELDS) break
  }
  return [...seen.values()].slice(0, MAX_FIELDS)
}

function collectFields(
  value: unknown,
  path: string,
  source: string,
  seen: Map<string, WordPressFieldToken>,
) {
  if (seen.size >= MAX_FIELDS) return
  if (value == null) return
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    if (!path || seen.has(path)) return
    seen.set(path, {
      token: `{{${path}}}`,
      path,
      label: labelFromPath(path),
      source,
      sample: String(value).slice(0, 120),
      type,
    })
    return
  }
  if (Array.isArray(value)) {
    value.slice(0, 3).forEach((item, index) => {
      collectFields(item, `${path}.${index}`.replace(/^\./, ''), source, seen)
    })
    return
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectFields(child, `${path}.${key}`.replace(/^\./, ''), source, seen)
      if (seen.size >= MAX_FIELDS) return
    }
  }
}

function labelFromPath(path: string): string {
  return path
    .replace(/\.\d+\./g, ' item ')
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function renderWordPressTemplate(template: string, context: unknown): string {
  if (!template) return ''
  return template.replace(/\{\{\s*([^}|]+)(?:\|([^}]+))?\s*\}\}/g, (_match, rawPath, rawFallback) => {
    const path = String(rawPath || '').trim()
    const fallback = rawFallback == null ? '' : String(rawFallback).trim()
    const value = resolveTemplatePath(context, path)
    if (value == null || value === '') return fallback
    return String(value)
  })
}

export function resolveTemplatePath(context: unknown, path: string): unknown {
  if (!context || typeof context !== 'object' || !path) return undefined
  const root = context as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(root, path)) return root[path]
  const underscore = path.replace(/\./g, '_')
  if (Object.prototype.hasOwnProperty.call(root, underscore)) return root[underscore]
  let current: unknown = root
  for (const part of path.split('.')) {
    if (current == null) return undefined
    if (Array.isArray(current)) {
      const index = Number(part)
      if (!Number.isInteger(index)) return undefined
      current = current[index]
      continue
    }
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function wordpressMetadataFromEvent(params: {
  connectionId: string
  eventId: string
  trigger: string
  resourceType: string
  resourceId: string
  payload: unknown
}) {
  const payload = sanitizeWordPressPayload(params.payload)
  const flat = flattenForMetadata(payload)
  return {
    source: 'wordpress',
    wordpressConnectionId: params.connectionId,
    wordpressEventId: params.eventId,
    wordpressTrigger: params.trigger,
    wordpressResourceType: params.resourceType,
    wordpressResourceId: params.resourceId,
    wordpressPayloadJson: JSON.stringify(payload).slice(0, 8000),
    ...flat,
  }
}

function flattenForMetadata(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (Object.keys(out).length >= 80) return out
  if (value == null) return out
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    if (prefix) out[prefix.replace(/\./g, '_')] = String(value).slice(0, 300)
    return out
  }
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, index) => {
      flattenForMetadata(item, `${prefix}.${index}`.replace(/^\./, ''), out)
    })
    return out
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenForMetadata(child, `${prefix}.${key}`.replace(/^\./, ''), out)
      if (Object.keys(out).length >= 80) break
    }
  }
  return out
}

export function contextFromCall(call: Pick<CallDoc, 'metadata' | '_id' | 'dtmfPath'>, digit = '') {
  const metadata =
    call.metadata && typeof call.metadata === 'object'
      ? { ...(call.metadata as Record<string, unknown>) }
      : {}
  let payload: unknown = {}
  const rawPayload = metadata.wordpressPayloadJson
  if (typeof rawPayload === 'string' && rawPayload) {
    try {
      payload = JSON.parse(rawPayload) as unknown
    } catch {
      payload = {}
    }
  }
  return {
    ...metadata,
    ...(payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}),
    call: { id: String(call._id), dtmfPath: call.dtmfPath || '', digit },
    digit,
  }
}

export async function executeWordPressDtmfActions(params: {
  call: CallDoc
  digit: string
  menuItem?: DtmfMenuItemLike | null
}) {
  const item = params.menuItem
  if (!item) return []
  const actionType = String(item.actionType || '').trim()
  const actionConfig =
    item.actionConfig && typeof item.actionConfig === 'object' ? item.actionConfig : {}
  const legacy = String(item.action || '')
  const results: Array<Record<string, unknown>> = []

  if (actionType === 'wordpress' || legacy.startsWith('wordpress:')) {
    results.push(await dispatchWordPressAction(params.call, params.digit, actionConfig, legacy))
  } else if (actionType === 'webhook') {
    results.push(await dispatchWebhookAction(params.call, params.digit, actionConfig))
  }
  return results
}

async function dispatchWebhookAction(call: CallDoc, digit: string, config: Record<string, unknown>) {
  const url = String(config.url || '').trim()
  if (!/^https?:\/\//.test(url)) return { type: 'webhook', ok: false, error: 'missing webhook url' }
  const body = JSON.stringify({
    event: 'call.dtmf',
    callId: String(call._id),
    digit,
    metadata: call.metadata || {},
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { type: 'webhook', ok: res.ok, status: res.status }
}

async function dispatchWordPressAction(
  call: CallDoc,
  digit: string,
  config: Record<string, unknown>,
  legacyAction: string,
) {
  const metadata =
    call.metadata && typeof call.metadata === 'object'
      ? (call.metadata as Record<string, unknown>)
      : {}
  const connectionId = String(config.connectionId || metadata.wordpressConnectionId || '')
  if (!Types.ObjectId.isValid(connectionId)) {
    return { type: 'wordpress', ok: false, error: 'missing wordpress connection id' }
  }
  const connection = await Connection.findOne({
    _id: connectionId,
    orgId: call.orgId,
    platform: 'wordpress',
    active: true,
  })
  if (!connection) return { type: 'wordpress', ok: false, error: 'wordpress connection not found' }
  const secret = decryptWordPressSigningSecret(connection.config)
  if (!secret) return { type: 'wordpress', ok: false, error: 'wordpress signing secret missing' }
  const action = String(config.action || legacyAction.split(':', 2)[1] || 'add_order_note')
  const context = contextFromCall(call, digit)
  const payload = {
    idempotencyKey: `${String(call._id)}:${digit}:${action}`,
    connectionId,
    callId: String(call._id),
    digit,
    resource: {
      type: String(config.resourceType || metadata.wordpressResourceType || 'order'),
      id: String(config.resourceId || metadata.wordpressResourceId || ''),
    },
    action: {
      type: action,
      status: config.status ? String(config.status) : undefined,
      note: renderWordPressTemplate(String(config.noteTemplate || ''), context),
      message: renderWordPressTemplate(String(config.messageTemplate || ''), context),
    },
  }
  const raw = JSON.stringify(payload)
  const siteUrl = String(connection.siteUrl || '').replace(/\/+$/, '')
  if (!siteUrl) return { type: 'wordpress', ok: false, error: 'wordpress site url missing' }
  const res = await fetch(`${siteUrl}/wp-json/livocall/v1/actions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [WORDPRESS_SIGNATURE_HEADER]: signWebhook(secret, raw),
      'user-agent': 'livocall-wordpress-actions/1',
    },
    body: raw,
  })
  const text = await res.text().catch(() => '')
  return {
    type: 'wordpress',
    ok: res.ok,
    status: res.status,
    action,
    body: text.slice(0, 500),
  }
}

export async function recordDtmfActionResults(callId: string, digit: string, results: unknown[]) {
  if (!Types.ObjectId.isValid(callId) || results.length === 0) return
  await Call.updateOne(
    { _id: callId },
    {
      $push: {
        ivrEvents: {
          type: 'dtmf_action_results',
          digit,
          results,
          at: new Date().toISOString(),
        },
      },
    },
  )
}
