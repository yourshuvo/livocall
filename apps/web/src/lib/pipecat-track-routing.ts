export interface PipecatTrackParticipant {
  local?: boolean
}

type AudioTrackLike = Pick<MediaStreamTrack, 'kind' | 'id'>

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
