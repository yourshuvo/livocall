export const BROWSER_REMOTE_AUDIO_READY_TIMEOUT_MS = 8000

export interface BrowserRemoteAudioReadyHandle {
  promise: Promise<void>
  resolve: () => void
  reject: (error: Error) => void
}

export function createBrowserRemoteAudioReadyHandle(): BrowserRemoteAudioReadyHandle {
  let settled = false
  let resolvePromise!: () => void
  let rejectPromise!: (error: Error) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve: () => {
      if (settled) return
      settled = true
      resolvePromise()
    },
    reject: (error: Error) => {
      if (settled) return
      settled = true
      rejectPromise(error)
    },
  }
}

export function waitForBrowserRemoteAudioReady(
  ready: BrowserRemoteAudioReadyHandle,
  timeoutMs = BROWSER_REMOTE_AUDIO_READY_TIMEOUT_MS,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<void>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Remote browser-test audio did not become playable'))
    }, timeoutMs)
  })
  return Promise.race([ready.promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}
