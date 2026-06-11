export type Tier = 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'

export const agentLanguageOptions = [
  { k: 'bn', label: 'Bangla', grokSupported: true },
  { k: 'bn-en-mixed', label: 'Bangla + English', grokSupported: false },
  { k: 'bn-BD', label: 'Bangla (BD)', grokSupported: false },
  { k: 'en-US', label: 'English (US)', grokSupported: false },
] as const

export const agentLanguageCodes = agentLanguageOptions.map((l) => l.k) as [
  (typeof agentLanguageOptions)[number]['k'],
  ...(typeof agentLanguageOptions)[number]['k'][],
]

export type AgentLanguage = (typeof agentLanguageOptions)[number]['k']

export const defaultAgentLanguageCodes = ['bn', 'bn-en-mixed', 'bn-BD', 'en-US'] as const

export function languageOptionsForTier(tier: Tier) {
  if (tier === 'grok_voice') return agentLanguageOptions.filter((l) => l.grokSupported)
  if (tier === 'gemini_live') {
    return agentLanguageOptions.filter((l) =>
      (['bn', ...defaultAgentLanguageCodes] as readonly string[]).includes(l.k),
    )
  }
  return agentLanguageOptions.filter((l) =>
    (defaultAgentLanguageCodes as readonly string[]).includes(l.k),
  )
}

export function defaultLanguageForTier(tier: Tier): AgentLanguage {
  return tier === 'grok_voice' || tier === 'gemini_live' || tier === 'pipeline' ? 'bn' : 'bn-en-mixed'
}

export type AgentStatus = 'draft' | 'live'

export type CallOutcome =
  | 'completed'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'voicemail'
  | 'in_progress'

export const tierLabel: Record<Tier, string> = {
  gemini_live: 'Conversational · Gemini Live',
  grok_voice: 'Conversational · Grok Voice',
  pipeline: 'Pipeline · Soniox + Flash + Soniox/Cartesia',
  dtmf: 'IVR · DTMF + cached TTS',
}

export const tierBadge: Record<Tier, string> = {
  gemini_live: 'T1',
  grok_voice: 'Grok',
  pipeline: 'T2',
  dtmf: 'T3',
}
