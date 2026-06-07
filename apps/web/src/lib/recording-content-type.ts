const ALLOWED_RECORDING_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
])

export function normalizeRecordingContentType(contentType: string) {
  return (contentType || 'audio/webm').split(';', 1)[0]?.trim().toLowerCase() || 'audio/webm'
}

export function isAllowedRecordingContentType(contentType: string) {
  return ALLOWED_RECORDING_AUDIO_TYPES.has(normalizeRecordingContentType(contentType))
}

export function extensionForRecordingContentType(contentType: string): string {
  const normalized = normalizeRecordingContentType(contentType)
  if (normalized.includes('mp4')) return 'm4a'
  if (normalized.includes('mpeg')) return 'mp3'
  if (normalized.includes('ogg')) return 'ogg'
  if (normalized.includes('wav')) return 'wav'
  return 'webm'
}
