import { NextResponse } from 'next/server'
import { isMongoConfigured } from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'livocall-web',
    mongoConfigured: isMongoConfigured(),
    timestamp: new Date().toISOString(),
  })
}