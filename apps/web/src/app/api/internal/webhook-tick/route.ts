export const dynamic = 'force-dynamic'
/**
 * Webhook delivery cron tick. Hit by an external scheduler (e.g. Vercel cron,
 * GitHub Actions, k8s CronJob) every ~30 seconds. Authenticated via the same
 * shared secret as voice events.
 */

import { NextResponse } from 'next/server'
import { processWebhookQueue } from '@/lib/webhooks'
import { apiError, withErrors } from '@/lib/errors'
import { connectMongo } from '@/lib/db'
import { runCampaignTick } from '@/lib/campaign-runner'
import { runComplianceRetention } from '@/lib/compliance'
import { runMissedCallbackTick } from '@/lib/missed-callbacks'

const SHARED_SECRET = process.env.VOICE_SHARED_SECRET || ''

function authOk(req: Request): boolean {
  if (!SHARED_SECRET) return false
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${SHARED_SECRET}`
}

export const POST = withErrors(async (req: Request) => {
  if (!authOk(req)) return apiError('unauthenticated')
  await connectMongo()
  const [delivered, campaigns, missedCallbacks, compliance] = await Promise.all([
    processWebhookQueue(32),
    runCampaignTick(32),
    runMissedCallbackTick(32),
    runComplianceRetention(),
  ])
  return NextResponse.json({ delivered, campaigns, missedCallbacks, compliance })
})

export const GET = POST
