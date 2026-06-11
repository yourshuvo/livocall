export const DEFAULT_AGENT_PAYLOAD = {
  name: 'Untitled agent',
  description: '',
  tier: 'pipeline',
  model: 'gemini-2.5-flash-lite',
  language: 'bn',
  voice: { provider: 'soniox', voiceId: 'Adrian', style: 'conversational' },
  prompt: { system: '', firstMessage: '', guardrails: '' },
  runtimeSettings: {
    transcriptionMode: 'speed',
    sttProvider: 'soniox',
    geminiLiveVadSilenceMs: 250,
  },
  knowledgeBaseIds: [],
  postCallWebhook: '',
} as const
