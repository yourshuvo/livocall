import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'rate_limited'
  | 'internal'
  | 'upstream_error'

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
  upstream_error: 502,
}

export function apiError(code: ApiErrorCode, message?: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message: message ?? code, details: details ?? null } },
    { status: STATUS[code] },
  )
}

export function fromZodError(err: ZodError) {
  return apiError(
    'invalid_input',
    'request body failed validation',
    err.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
  )
}

/** Wraps an async route handler so we never leak stack traces. */
export function withErrors<T extends (...args: never[]) => Promise<Response>>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (e) {
      if (e instanceof ZodError) return fromZodError(e)
      const message = e instanceof Error ? e.message : 'internal error'
      // eslint-disable-next-line no-console
      console.error('[api]', message, e)
      return apiError('internal', 'something went wrong')
    }
  }) as T
}
