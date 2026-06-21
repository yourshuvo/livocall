interface OriginateInput {
  agentId: string
  toE164: string
  fromE164?: string
  tier?: string
  tools?: unknown[]
  metadata?: Record<string, unknown>
}

interface OriginateResult {
  callId: string
  edgeUuid?: string
  queued?: boolean
}

interface ControlResult {
  ok: boolean
  action?: 'listen' | 'barge'
  streamUrl?: string
  supervisorLegUuid?: string
  error?: string
}

function voiceBaseUrl() {
  return (process.env.VOICE_SERVICE_URL || process.env.NEXT_PUBLIC_VOICE_SERVICE_URL || '').replace(
    /\/+$/,
    '',
  )
}

async function voiceRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = voiceBaseUrl()
  if (!base) throw new Error('Voice service is not configured')
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.VOICE_SERVICE_TOKEN
        ? { authorization: `Bearer ${process.env.VOICE_SERVICE_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as T & { detail?: unknown }
  if (!res.ok) {
    const detail = json.detail
      ? `: ${typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail)}`
      : ''
    throw new Error(`Voice service returned ${res.status}${detail}`)
  }
  return json
}

function stringMetadata(metadata?: Record<string, unknown>): Record<string, string> | undefined {
  if (!metadata) return undefined
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, value == null ? '' : String(value)]),
  )
}

export const voiceClient = {
  originate(input: OriginateInput): Promise<OriginateResult> {
    return voiceRequest<OriginateResult>('/calls/originate', {
      agent_id: input.agentId,
      to_e164: input.toE164,
      from_e164: input.fromE164,
      tier: input.tier,
      tools: input.tools ?? [],
      metadata: stringMetadata(input.metadata) ?? {},
    })
  },
  control(callId: string, action: 'listen' | 'barge', supervisorId: string, targetE164: string) {
    return voiceRequest<ControlResult>(`/calls/${encodeURIComponent(callId)}/control`, {
      action,
      supervisor_id: supervisorId,
      target_e164: targetE164,
    })
  },
  hangup(callId: string) {
    return voiceRequest<{ ok: boolean }>(`/calls/${encodeURIComponent(callId)}/hangup`, {})
  },
}
