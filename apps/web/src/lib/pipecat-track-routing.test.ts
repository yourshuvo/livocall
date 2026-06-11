import { describe, expect, it } from 'vitest'

import {
  isLocalPipecatAudioTrack,
  shouldAttachRemotePipecatAudioTrack,
  shouldTearDownRemotePipecatAudioTrack,
} from './pipecat-track-routing'

function track(kind: MediaStreamTrack['kind'], id: string, readyState: MediaStreamTrackState = 'live') {
  return { kind, id, readyState } as MediaStreamTrack
}

describe('Pipecat track routing', () => {
  it('does not attach local mic tracks as remote playback even before client tracks are populated', () => {
    const mic = track('audio', 'mic-track')

    expect(isLocalPipecatAudioTrack(mic, { local: true }, undefined)).toBe(true)
    expect(shouldAttachRemotePipecatAudioTrack(mic, { local: true }, undefined)).toBe(false)
  })

  it('falls back to local audio track id when participant metadata is absent', () => {
    const mic = track('audio', 'mic-track')

    expect(isLocalPipecatAudioTrack(mic, undefined, mic)).toBe(true)
    expect(shouldAttachRemotePipecatAudioTrack(mic, undefined, mic)).toBe(false)
  })

  it('attaches only remote audio tracks', () => {
    const bot = track('audio', 'bot-track')
    const video = track('video', 'bot-video')

    expect(shouldAttachRemotePipecatAudioTrack(bot, { local: false }, undefined)).toBe(true)
    expect(shouldAttachRemotePipecatAudioTrack(video, { local: false }, undefined)).toBe(false)
  })

  it('does not tear down remote audio when SmallWebRTC reports mute as track stopped', () => {
    const mutedButLiveBotTrack = track('audio', 'bot-track', 'live')
    const endedBotTrack = track('audio', 'bot-track', 'ended')

    expect(
      shouldTearDownRemotePipecatAudioTrack(mutedButLiveBotTrack, { local: false }, undefined),
    ).toBe(false)
    expect(shouldTearDownRemotePipecatAudioTrack(endedBotTrack, { local: false }, undefined)).toBe(
      true,
    )
  })
})
