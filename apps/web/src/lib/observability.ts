/**
 * Lightweight observability shim. Everything here is optional and only
 * activates when the relevant env var is set so the dev loop stays zero-dep.
 *
 * - `initSentry()` — dynamically imports `@sentry/nextjs` when SENTRY_DSN is
 *   set. No-op otherwise. Safe to call from a top-level module (instrumented
 *   via Next.js `instrumentation.ts`).
 * - `getRequestId()` — reads `x-request-id` from the active request headers
 *   (set by `src/proxy.ts`) so API handlers can log with it.
 */

import { headers } from 'next/headers'

export async function getRequestId(): Promise<string> {
  try {
    return (await headers()).get('x-request-id') || ''
  } catch {
    // headers() throws outside a request scope — that's fine.
    return ''
  }
}

let sentryInitialized = false

export async function initSentry(): Promise<void> {
  if (sentryInitialized) return
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  sentryInitialized = true
  try {
    // Dynamic import via new Function + string so bundlers don't try to
    // resolve `@sentry/nextjs` at build time. If the package isn't installed
    // the dynamic require throws and we warn. Keeps @sentry/nextjs an
    // optional peer dep.
    const modName = '@sentry/nextjs'
    const dynImport: (spec: string) => Promise<Record<string, unknown>> = new Function(
      's',
      'return import(s)',
    ) as (spec: string) => Promise<Record<string, unknown>>
    const mod = await dynImport(modName).catch(() => null)
    if (!mod || typeof mod.init !== 'function') {
      console.warn('[observability] SENTRY_DSN set but @sentry/nextjs not installed')
      return
    }
    ;(mod.init as (cfg: Record<string, unknown>) => void)({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      environment: process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE,
    })
  } catch (err) {
    console.warn('[observability] sentry init failed', err)
  }
}

/**
 * Structured log helper. Prefix every line with the correlation id so logs
 * are easy to correlate across web/voice. Uses console.log — operators wire
 * whatever log collector they prefer.
 */
export async function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
): Promise<void> {
  const reqId = await getRequestId()
  const payload = JSON.stringify({ level, event, reqId, ...fields, ts: new Date().toISOString() })
  if (level === 'error') console.error(payload)
  else if (level === 'warn') console.warn(payload)
  else console.log(payload)
}
