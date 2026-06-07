import { describe, expect, it } from 'vitest'

import { extensionForRecordingContentType, isAllowedRecordingContentType } from './recording-content-type'

describe('recording content types', () => {
  it('accepts browser MediaRecorder audio MIME types with codec parameters', () => {
    expect(isAllowedRecordingContentType('audio/webm;codecs=opus')).toBe(true)
    expect(extensionForRecordingContentType('audio/webm;codecs=opus')).toBe('webm')
  })

  it('rejects non-audio uploads', () => {
    expect(isAllowedRecordingContentType('video/webm;codecs=vp9')).toBe(false)
    expect(isAllowedRecordingContentType('text/plain')).toBe(false)
  })
})
