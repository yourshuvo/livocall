import { describe, expect, it } from 'vitest'

import {
  PUBLIC_WEBCALL_DISCONNECT_ON_BOT_DISCONNECT,
  shouldEndPublicWebcallOnBotDisconnect,
} from './public-webcall-session'

describe('public Webcall session lifecycle', () => {
  it('keeps the mobile mic alive when only the bot participant disconnects', () => {
    expect(PUBLIC_WEBCALL_DISCONNECT_ON_BOT_DISCONNECT).toBe(false)
    expect(shouldEndPublicWebcallOnBotDisconnect()).toBe(false)
  })
})
