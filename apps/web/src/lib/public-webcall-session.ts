export const PUBLIC_WEBCALL_DISCONNECT_ON_BOT_DISCONNECT = false

export function shouldEndPublicWebcallOnBotDisconnect() {
  // Public demo calls should be owned by the WebRTC transport lifecycle, not
  // the bot participant lifecycle. PipecatClient defaults to disconnecting the
  // browser when the bot participant disconnects, which can stop the phone mic
  // on transient/early bot lifecycle events and make the green live indicator
  // disappear while the user is still speaking.
  return false
}
