/**
 * Next.js calls `register()` once at server start (when
 * `experimental.instrumentationHook` or Next 14.2+ autodetection is on).
 *
 * Use it to bootstrap Sentry and OpenTelemetry — both guarded behind env vars
 * so the dev loop stays free of optional dependencies.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { initSentry } = await import('@/lib/observability')
  await initSentry()
}
