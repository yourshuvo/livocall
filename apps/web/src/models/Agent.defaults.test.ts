import { describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import { Agent } from './Agent'

describe('Agent defaults', () => {
  it('defaults new dashboard agents to low-latency runtime settings', () => {
    const agent = new Agent({
      orgId: new Types.ObjectId(),
      name: 'Low latency agent',
      tier: 'pipeline',
    })

    expect(agent.runtimeSettings?.transcriptionMode).toBe('speed')
    expect(agent.runtimeSettings?.geminiLiveVadSilenceMs).toBe(250)
    expect(agent.voice?.provider).toBe('soniox')
    expect(agent.voice?.voiceId).toBe('Adrian')
  })
})