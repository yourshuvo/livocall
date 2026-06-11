import { describe, expect, it, vi } from 'vitest'

import {
  createBrowserRemoteAudioReadyHandle,
  waitForBrowserRemoteAudioReady,
} from './browser-audio-readiness'

describe('browser remote audio readiness', () => {
  it('resolves when remote audio playback is confirmed', async () => {
    const ready = createBrowserRemoteAudioReadyHandle()

    ready.resolve()

    await expect(waitForBrowserRemoteAudioReady(ready, 50)).resolves.toBeUndefined()
  })

  it('rejects instead of marking live when no playable remote audio arrives', async () => {
    vi.useFakeTimers()
    try {
      const ready = createBrowserRemoteAudioReadyHandle()
      const result = waitForBrowserRemoteAudioReady(ready, 50)
      const assertion = expect(result).rejects.toThrow(
        'Remote browser-test audio did not become playable',
      )

      await vi.advanceTimersByTimeAsync(51)

      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
