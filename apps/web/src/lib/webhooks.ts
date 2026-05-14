import { connectMongo } from '@/lib/db'
import { Webhook, type WebhookEvent } from '@/models/Webhook'
import { WebhookDelivery } from '@/models/WebhookDelivery'
import { signWebhook } from '@/lib/hmac'

/**
 * Enqueue a webhook event for every active webhook in the org subscribed to
 * the event. Delivery itself happens via {@link processWebhookQueue}, which a
 * background worker (or a cron) calls every few seconds.
 *
 * In dev, delivery is opportunistic — calling code does NOT await the worker.
 */
export async function emitWebhook(orgId: string, event: WebhookEvent, payload: unknown) {
  await connectMongo()
  const hooks = await Webhook.find({ orgId, active: true, events: event }).lean()
  if (hooks.length === 0) return
  await WebhookDelivery.insertMany(
    hooks.map((h) => ({
      orgId,
      webhookId: h._id,
      event,
      payload,
      attempts: 0,
      nextAttemptAt: new Date(),
    })),
  )
  // best-effort kick — caller doesn't await
  processWebhookQueue().catch(() => {})
}

export async function emitDirectWebhook(
  orgId: string,
  event: WebhookEvent,
  url: string,
  payload: unknown,
  secret = '',
) {
  const cleanUrl = url.trim()
  if (!cleanUrl) return
  await connectMongo()
  await WebhookDelivery.create({
    orgId,
    url: cleanUrl,
    secret,
    event,
    payload,
    attempts: 0,
    nextAttemptAt: new Date(),
  })
  processWebhookQueue().catch(() => {})
}

const MAX_ATTEMPTS = 8
// Exponential backoff in seconds: 1, 4, 16, 64, 256, 1024, 4096, 16384
function backoffSec(attempts: number): number {
  return Math.min(60 * 60 * 24, 4 ** attempts)
}

export async function processWebhookQueue(maxBatch = 16): Promise<number> {
  await connectMongo()
  const due = await WebhookDelivery.find({
    deliveredAt: null,
    deadAt: null,
    nextAttemptAt: { $lte: new Date() },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(maxBatch)
  let delivered = 0
  for (const d of due) {
    // eslint-disable-next-line no-await-in-loop
    const hook = d.webhookId ? await Webhook.findById(d.webhookId) : null
    const url = hook?.url || d.url
    const secret = hook?.secret || d.secret || ''
    if (!url || (d.webhookId && (!hook || !hook.active))) {
      d.deadAt = new Date()
      d.lastError = 'webhook inactive or deleted'
      // eslint-disable-next-line no-await-in-loop
      await d.save()
      continue
    }
    const body = JSON.stringify({ event: d.event, payload: d.payload, deliveryId: String(d._id) })
    const sig = signWebhook(secret, body)
    let status = 0
    let err: string | undefined
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-livocall-signature': sig,
          'x-livocall-event': d.event,
          'user-agent': 'livocall-webhooks/1',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      status = res.status
      if (!res.ok) err = `${res.status} ${res.statusText}`
    } catch (e) {
      err = e instanceof Error ? e.message : 'fetch failed'
    }
    d.attempts += 1
    d.lastStatus = status
    d.lastError = err
    if (status >= 200 && status < 300) {
      d.deliveredAt = new Date()
      if (hook) {
        hook.lastDeliveryAt = new Date()
        hook.lastDeliveryStatus = status
        hook.failureCount = 0
      }
      delivered += 1
    } else if (d.attempts >= MAX_ATTEMPTS) {
      d.deadAt = new Date()
      if (hook) hook.failureCount = (hook.failureCount ?? 0) + 1
    } else {
      d.nextAttemptAt = new Date(Date.now() + backoffSec(d.attempts) * 1000)
      if (hook) hook.failureCount = (hook.failureCount ?? 0) + 1
    }
    // eslint-disable-next-line no-await-in-loop
    await Promise.all([d.save(), hook ? hook.save() : Promise.resolve()])
  }
  return delivered
}
