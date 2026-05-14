export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import { runCampaignTick } from '@/lib/campaign-runner'

const SHARED_SECRET = process.env.VOICE_SHARED_SECRET || ''

function authOk(req: Request): boolean {
  if (!SHARED_SECRET) return false
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${SHARED_SECRET}`
}

export const POST = withErrors(async (req: Request) => {
  if (!authOk(req)) return apiError('unauthenticated')
  await connectMongo()
  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 50)))
  return NextResponse.json(await runCampaignTick(limit))
})

export const GET = POST
