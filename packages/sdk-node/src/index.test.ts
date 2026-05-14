import { describe, it, expect } from 'vitest'
import { LivoCallClient, LivoCallApiError } from './index'

function makeFetch(
  responses: Array<{
    status?: number
    body?: unknown
    assert?: (url: string, init: RequestInit) => void
  }>,
): typeof fetch {
  let i = 0
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const r = responses[i++]
    r.assert?.(url, init || {})
    const text = r.body === undefined ? '' : JSON.stringify(r.body)
    return new Response(text, {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
}

describe('LivoCallClient', () => {
  it('requires an apiKey', () => {
    // @ts-expect-error — intentional
    expect(() => new LivoCallClient({})).toThrow(/apiKey/)
  })

  it('sends bearer auth and parses ok responses', async () => {
    const bd = new LivoCallClient({
      apiKey: 'lvo_test_123',
      fetch: makeFetch([
        {
          body: { data: [{ id: 'a1', name: 'Agent', tier: 't2', language: 'bn', voice: 'x', status: 'live' }] },
          assert: (url, init) => {
            expect(url).toContain('/api/v1/agents')
            expect((init.headers as Record<string, string>).authorization).toBe(
              'Bearer lvo_test_123',
            )
          },
        },
      ]),
    })
    const res = await bd.agents.list()
    expect(res.data).toHaveLength(1)
    expect(res.data[0].name).toBe('Agent')
  })

  it('POSTs originate with JSON body', async () => {
    const bd = new LivoCallClient({
      apiKey: 'lvo_test_123',
      fetch: makeFetch([
        {
          body: { id: 'c1', agentId: 'a1', toE164: '+8801700000000', tier: 't2', startedAt: '2025-01-01T00:00:00Z' },
          assert: (url, init) => {
            expect(url).toContain('/api/v1/calls')
            expect(init.method).toBe('POST')
            expect(JSON.parse(init.body as string)).toMatchObject({
              agent_id: 'a1',
              to_e164: '+8801700000000',
            })
          },
        },
      ]),
    })
    const r = await bd.calls.originate({ agent_id: 'a1', to_e164: '+8801700000000' })
    expect(r.id).toBe('c1')
  })

  it('throws LivoCallApiError on non-2xx', async () => {
    const bd = new LivoCallClient({
      apiKey: 'x',
      fetch: makeFetch([{ status: 403, body: { error: { code: 'forbidden', message: 'DNC' } } }]),
    })
    await expect(bd.calls.originate({ agent_id: 'a', to_e164: '+880' })).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    })
    await expect(bd.calls.originate({ agent_id: 'a', to_e164: '+880' })).rejects.toBeInstanceOf(
      Error,
    )
  })

  it('serialises query params', async () => {
    const bd = new LivoCallClient({
      apiKey: 'x',
      fetch: makeFetch([
        {
          body: { data: [] },
          assert: (url) => {
            expect(url).toContain('limit=10')
            expect(url).toContain('outcome=completed')
          },
        },
      ]),
    })
    await bd.calls.list({ limit: 10, outcome: 'completed' })
  })

  it('LivoCallApiError carries fields', () => {
    const e = new LivoCallApiError(429, 'rate_limited', 'slow down')
    expect(e.status).toBe(429)
    expect(e.code).toBe('rate_limited')
  })
})
