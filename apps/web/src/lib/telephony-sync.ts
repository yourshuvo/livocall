type SyncReason = 'number.create' | 'number.update' | 'number.delete'

export async function triggerTelephonySync(reason: SyncReason, numberId?: string) {
  const voiceBase = (process.env.VOICE_SERVICE_URL || '').replace(/\/+$/, '')
  const voiceToken = process.env.VOICE_SERVICE_TOKEN || ''
  if (!voiceBase || !voiceToken) return

  try {
    const res = await fetch(`${voiceBase}/pjsip/reload`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${voiceToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reason, numberId }),
      signal: AbortSignal.timeout(5_000),
    })
    if (res.ok) return
    console.warn('pjsip account reload failed', { status: res.status, reason, numberId })
  } catch (error) {
    console.warn('pjsip account reload unavailable', { reason, numberId, error })
  }
}
