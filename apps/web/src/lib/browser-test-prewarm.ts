export function shouldPrewarmBrowserVoice(tier: string, alreadyStarted: boolean) {
  if (alreadyStarted) return false
  return tier === 'gemini_live' || tier === 'pipeline'
}
