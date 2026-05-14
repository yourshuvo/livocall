export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { connectMongo } from '@/lib/db'
import { apiError, withErrors } from '@/lib/errors'
import { runComplianceRetention } from '@/lib/compliance'

const SHARED_SECRET = process.env.VOICE_SHARED_SECRET || ''

function authOk(req: Request): boolean {
  if (!SHARED_SECRET) return false
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${SHARED_SECRET}`
}

export const POST = withErrors(async (req: Request) => {
  if (!authOk(req)) return apiError('unauthenticated')
  await connectMongo()
  return NextResponse.json(await runComplianceRetention())
})

export const GET = POST
