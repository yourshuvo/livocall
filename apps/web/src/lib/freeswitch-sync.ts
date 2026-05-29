type SyncReason = 'number.create' | 'number.update' | 'number.delete'

export async function triggerFreeswitchSync(reason: SyncReason, numberId?: string) {
  const url = process.env.FREESWITCH_SYNC_WEBHOOK_URL
  const token = process.env.FREESWITCH_SYNC_WEBHOOK_TOKEN
  if (!url || !token) return

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reason, numberId }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      console.warn('freeswitch sync webhook failed', {
        status: res.status,
        reason,
        numberId,
      })
    }
  } catch (error) {
    console.warn('freeswitch sync webhook unavailable', { reason, numberId, error })
  }
}
