import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { apiError, fromZodError, withErrors } from './errors'

describe('apiError', () => {
  it('emits stable shape', async () => {
    const r = apiError('not_found', 'no such thing')
    expect(r.status).toBe(404)
    const body = await r.json()
    expect(body.error.code).toBe('not_found')
    expect(body.error.message).toBe('no such thing')
  })

  it('rate_limited maps to 429', () => {
    expect(apiError('rate_limited').status).toBe(429)
  })

  it('upstream_error maps to 502', () => {
    expect(apiError('upstream_error').status).toBe(502)
  })

  it('unknown code maps to 500', () => {
    expect(apiError('internal').status).toBe(500)
  })
})

describe('fromZodError', () => {
  it('flattens issues', async () => {
    const schema = z.object({ name: z.string().min(2), age: z.number() })
    const parsed = schema.safeParse({ name: 'A', age: 'not-a-number' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const r = fromZodError(parsed.error)
    expect(r.status).toBe(400)
    const body = await r.json()
    expect(body.error.code).toBe('invalid_input')
    expect(Array.isArray(body.error.details)).toBe(true)
  })
})

describe('withErrors', () => {
  it('catches thrown ZodError into invalid_input', async () => {
    const handler = withErrors(async (_req: Request) => {
      const schema = z.object({ x: z.number() })
      schema.parse({ x: 'wrong' })
      return new Response('never')
    })
    const r = await handler(new Request('http://localhost/'))
    expect(r.status).toBe(400)
    const body = await r.json()
    expect(body.error.code).toBe('invalid_input')
  })

  it('catches generic error into internal', async () => {
    const handler = withErrors(async (_req: Request): Promise<Response> => {
      throw new Error('boom')
    })
    const r = await handler(new Request('http://localhost/'))
    expect(r.status).toBe(500)
    const body = await r.json()
    expect(body.error.code).toBe('internal')
  })
})
