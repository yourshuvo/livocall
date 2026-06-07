export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { browserIceServers, browserWebrtcPrewarmUrl } from '@/lib/browser-webrtc'
import { withErrors } from '@/lib/errors'

const PREWARM_TIMEOUT_MS = 1800

export const POST = withErrors(async () => {
  const prewarmUrl = browserWebrtcPrewarmUrl()
  if (!prewarmUrl) {
    return NextResponse.json({
      ok: false,
      enabled: false,
      handlerReady: false,
      iceServers: browserIceServers(),
      reason: 'browser WebRTC prewarm is not configured',
    })
  }

  try {
    const res = await fetch(prewarmUrl, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(PREWARM_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => null)
    return NextResponse.json({
      ok: res.ok && Boolean(data?.ok),
      enabled: Boolean(data?.enabled),
      handlerReady: Boolean(data?.handlerReady),
      iceServers: browserIceServers(),
      status: res.status,
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      enabled: true,
      handlerReady: false,
      iceServers: browserIceServers(),
      reason: err instanceof Error ? err.message : 'browser WebRTC prewarm failed',
    })
  }
})
