import { describe, expect, it } from 'vitest'

import { DEFAULT_AGENT_PAYLOAD } from './new-agent-defaults'

describe('new dashboard agent defaults', () => {
  it('matches the voice service low-latency Soniox pipeline defaults', () => {
    expect(DEFAULT_AGENT_PAYLOAD.tier).toBe('pipeline')
    expect(DEFAULT_AGENT_PAYLOAD.model).toBe('gemini-2.5-flash-lite')
    expect(DEFAULT_AGENT_PAYLOAD.language).toBe('bn')
    expect(DEFAULT_AGENT_PAYLOAD.voice).toMatchObject({
      provider: 'soniox',
      voiceId: 'Adrian',
    })
    expect(DEFAULT_AGENT_PAYLOAD.runtimeSettings).toMatchObject({
      transcriptionMode: 'speed',
      sttProvider: 'soniox',
      geminiLiveVadSilenceMs: 250,
    })
  })
})
