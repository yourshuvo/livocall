import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { getSession, type Session } from '@/lib/session'
import { apiError } from '@/lib/errors'

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

export type DashboardSession = Session & {
  userId: string
  orgId: string
  role?: 'owner' | 'admin' | 'agent'
}

export function isResponse<T>(value: T | Response): value is Response {
  return value instanceof Response
}

export async function requireDashboardSession(): Promise<DashboardSession | Response> {
  const session = await getSession()
  if (!session.userId || !session.orgId) return apiError('unauthenticated')
  return session as DashboardSession
}

export function objectIdOr400(value: string) {
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null
}

export function parsePagination(url: URL, defaultLimit = 50, maxLimit = 200) {
  const rawLimit = Number(url.searchParams.get('limit') ?? defaultLimit)
  const rawPage = Number(url.searchParams.get('page') ?? 1)
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : defaultLimit))
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1)
  return { limit, page, skip: (page - 1) * limit }
}

export async function dashboardRateLimit(
  orgId: string,
  key: string,
  limit = 30,
  windowMs = 60_000,
) {
  const bucketKey = `${orgId}:${key}`
  const now = Date.now()
  const current = rateBuckets.get(bucketKey)
  if (!current || current.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1 }
  }
  current.count += 1
  return {
    ok: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    retryAfterMs: Math.max(0, current.resetAt - now),
  }
}

export function ok(data: unknown = { ok: true }) {
  return NextResponse.json(data)
}