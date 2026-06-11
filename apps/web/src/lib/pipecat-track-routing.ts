export interface PipecatTrackParticipant {
  local?: boolean
}

type AudioTrackLike = Pick<MediaStreamTrack, 'kind' | 'id'> & {
  readyState?: MediaStreamTrackState
}

export function isLocalPipecatAudioTrack(
  track: AudioTrackLike,
  participant?: PipecatTrackParticipant,
  localAudioTrack?: AudioTrackLike | null,
) {
  if (track.kind !== 'audio') return false
  if (participant?.local) return true
  return Boolean(localAudioTrack?.id && localAudioTrack.id === track.id)
}

export function shouldAttachRemotePipecatAudioTrack(
  track: AudioTrackLike,
  participant?: PipecatTrackParticipant,
  localAudioTrack?: AudioTrackLike | null,
) {
  if (track.kind !== 'audio') return false
  return !isLocalPipecatAudioTrack(track, participant, localAudioTrack)
}

export function shouldTearDownRemotePipecatAudioTrack(
  track: AudioTrackLike,
  participant?: PipecatTrackParticipant,
  localAudioTrack?: AudioTrackLike | null,
) {
  if (!shouldAttachRemotePipecatAudioTrack(track, participant, localAudioTrack)) return false
  // SmallWebRTC maps track mute/unmute to onTrackStopped/onTrackStarted while
  // the underlying MediaStreamTrack is still live. Keep the audio element in
  // that case; only tear down on an actual ended remote track.
  return track.readyState === 'ended'
}
