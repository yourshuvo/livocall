'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Icon, type IconName } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BanglaAgentBuilder } from '@/components/app/bangla-agent-builder'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { defaultLanguageForTier, languageOptionsForTier } from '@/types/agent'
import type { PipecatClient } from '@pipecat-ai/client-js'

type Tier = 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'

interface DtmfMenuItem {
  key: string
  label: string
  action: string
}

interface DtmfConfig {
  menu: DtmfMenuItem[]
  maxAttempts: number
  interDigitTimeoutMs: number
  terminator: string
  noInputPromptUrl: string
}

interface AgentTool {
  name: string
  description: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  headers: Record<string, string>
  authHeader: string
  authValue: string
  authValueSet: boolean
  allowedDomains: string[]
  retries: number
  timeoutMs: number
  enabled: boolean
}

interface RuntimeSettings {
  welcomeMode?: 'ai' | 'caller' | 'silent'
  welcomeKind?: 'dynamic' | 'static'
  pauseBeforeSpeakingSec?: number
  denoiseMode?: 'none' | 'mixed' | 'off'
  transcriptionMode?: 'speed' | 'accuracy' | 'custom'
  vocabularyMode?: 'general' | 'medical'
  boostedKeywords?: string
  voicemailDetection?: boolean
  ivrHangup?: boolean
  keypadInput?: boolean
  keypadTimeoutSec?: number
  terminationKey?: boolean
  digitLimit?: boolean
  endSilenceMin?: number
  maxDurationHours?: number
  handoffTarget?: string
  handoffRules?: string
  geminiLiveVadSilenceMs?: number
  geminiKbToolTimeoutMs?: number
  geminiMemoryEnabled?: boolean
  geminiKbCacheEnabled?: boolean
}

interface OutcomeLabel {
  key: string
  label: string
  description: string
  conversion: boolean
}

interface OutcomeConfig {
  enabled: boolean
  labels: OutcomeLabel[]
}

interface AgentDto {
  id: string
  name: string
  description: string
  tier: Tier
  model: string
  language: string
  voice: { provider: string; voiceId: string; style: string }
  prompt: { system: string; firstMessage: string; guardrails: string }
  dtmf?: Partial<DtmfConfig>
  tools: AgentTool[]
  knowledgeBaseIds: string[]
  postCallWebhook: string
  runtimeSettings: RuntimeSettings
  geminiMemory?: {
    status: 'ready' | 'stale' | 'failed' | 'unsupported'
    updatedAt?: string | null
    cacheExpiresAt?: string | null
  } | null
  outcomeConfig?: OutcomeConfig | null
  status: 'draft' | 'live'
}

interface KbOption {
  id: string
  name: string
}

interface NumberOption {
  id: string
  e164: string
  providerName: string
}

type TestRunMode = 'browser' | 'call'
type BrowserTestStatus = 'idle' | 'connecting' | 'live'
type LiveTranscriptRole = 'user' | 'agent'

interface LiveTranscriptTurn {
  id: string
  role: LiveTranscriptRole
  text: string
  at: string
  final: boolean
}

const USER_INTERIM_TURN_ID = 'browser-user-interim'

interface BrowserWebrtcStartResult {
  callId: string
  transport: 'small-webrtc'
  webrtcUrl: string
  iceServers?: RTCIceServer[]
}

interface BrowserRawWebsocketStartResult {
  callId: string
  transport?: 'raw-websocket'
  wsUrl: string
  inputSampleRate: number
  outputSampleRate: number
}

type BrowserTestStartResult = BrowserWebrtcStartResult | BrowserRawWebsocketStartResult

interface LlmTestResult {
  response: string
  model: string
  latencyMs: number
  aiPowered: boolean
}

interface LlmChatMessage {
  role: 'caller' | 'agent'
  text: string
}

interface BrowserAudioSession {
  stream?: MediaStream
  remoteStream?: MediaStream
  remoteAudio?: HTMLAudioElement
  context?: AudioContext
  source?: MediaStreamAudioSourceNode
  processor?: ScriptProcessorNode
  socket?: WebSocket
  pipecat?: PipecatClient
  playbackTime: number
  outputSampleRate: number
}

/* ----------------------------- Engine catalog ----------------------------- */

interface EngineInfo {
  k: Tier
  label: string
  sub: string
  suggested: boolean
}

const ENGINE_OPTIONS: EngineInfo[] = [
  { k: 'pipeline', label: 'Pipeline', sub: 'STT → LLM → TTS (most flexible)', suggested: true },
  { k: 'gemini_live', label: 'Gemini Live', sub: 'Real-time bidirectional', suggested: false },
  { k: 'grok_voice', label: 'Grok Voice', sub: 'xAI realtime voice agent', suggested: false },
  { k: 'dtmf', label: 'DTMF / IVR', sub: 'Pre-rendered keypad menus', suggested: false },
]

interface ModelOption {
  k: string
  label: string
  sub: string
  badge?: 'Suggested' | 'New' | 'Beta'
  costPerMin: string
  latency: string
  tokenBudget: string
}

const MODEL_OPTIONS: Record<Tier, ModelOption[]> = {
  pipeline: [
    {
      k: 'gemini-3.1-flash',
      label: 'Gemini 3.1 Flash',
      sub: 'Currently wired pipeline LLM',
      badge: 'Suggested',
      costPerMin: '$0.060',
      latency: '900-1200ms',
      tokenBudget: '~960 tokens',
    },
  ],
  gemini_live: [
    {
      k: 'gemini-3.1-flash-live',
      label: 'Gemini 3.1 Flash Live',
      sub: 'Native audio in/out · low latency',
      badge: 'Suggested',
      costPerMin: '$0.115',
      latency: '120-200ms',
      tokenBudget: 'streaming',
    },
    {
      k: 'gemini-2.0-flash-live',
      label: 'Gemini 2.0 Flash Live',
      sub: 'Older Live-API model',
      costPerMin: '$0.090',
      latency: '160-260ms',
      tokenBudget: 'streaming',
    },
  ],
  grok_voice: [
    {
      k: 'grok-voice-think-fast-1.0',
      label: 'Grok Voice Think Fast',
      sub: 'xAI flagship realtime voice model',
      badge: 'New',
      costPerMin: '$0.050',
      latency: 'sub-second',
      tokenBudget: 'streaming',
    },
  ],
  dtmf: [
    {
      k: 'dtmf-cached',
      label: 'DTMF · cached TTS',
      sub: 'Plays pre-rendered audio per branch',
      badge: 'Suggested',
      costPerMin: '$0.040',
      latency: '~120ms',
      tokenBudget: '—',
    },
  ],
}

/* ------------------------------ Voice catalog ----------------------------- */

interface VoiceOption {
  id: string
  label: string
  provider: string
  accent: string
  styles: string[]
}

const VOICE_CATALOG: Record<string, VoiceOption[]> = {
  cartesia: [
    {
      id: 'cimo',
      label: 'Cimo',
      provider: 'cartesia',
      accent: 'BD · female',
      styles: ['conversational', 'news', 'storyteller'],
    },
    {
      id: 'anika',
      label: 'Anika',
      provider: 'cartesia',
      accent: 'BD · female',
      styles: ['conversational', 'news'],
    },
    {
      id: 'rahim',
      label: 'Rahim',
      provider: 'cartesia',
      accent: 'BD · male',
      styles: ['conversational', 'news'],
    },
    {
      id: 'maya-us',
      label: 'Maya',
      provider: 'cartesia',
      accent: 'US · female',
      styles: ['conversational', 'support'],
    },
    {
      id: 'theo-us',
      label: 'Theo',
      provider: 'cartesia',
      accent: 'US · male',
      styles: ['conversational', 'calm'],
    },
  ],
  eleven: [
    {
      id: 'eleven-rachel',
      label: 'Rachel',
      provider: 'eleven',
      accent: 'US · female',
      styles: ['default', 'news', 'whisper'],
    },
    {
      id: 'eleven-mark',
      label: 'Mark',
      provider: 'eleven',
      accent: 'US · male',
      styles: ['default', 'news'],
    },
    {
      id: 'eleven-bella',
      label: 'Bella',
      provider: 'eleven',
      accent: 'US · female',
      styles: ['default', 'narration'],
    },
  ],
  'gemini-live': [
    {
      id: 'aoede',
      label: 'Aoede',
      provider: 'gemini-live',
      accent: 'Bangla + English',
      styles: ['bilingual'],
    },
    {
      id: 'puck',
      label: 'Puck',
      provider: 'gemini-live',
      accent: 'Neutral',
      styles: ['conversational'],
    },
    {
      id: 'charon',
      label: 'Charon',
      provider: 'gemini-live',
      accent: 'Bangla + English',
      styles: ['bilingual'],
    },
    {
      id: 'kore',
      label: 'Kore',
      provider: 'gemini-live',
      accent: 'English · neutral',
      styles: ['calm'],
    },
    {
      id: 'fenrir',
      label: 'Fenrir',
      provider: 'gemini-live',
      accent: 'English · male',
      styles: ['conversational'],
    },
  ],
  xai: [
    {
      id: 'rohan',
      label: 'Rohan',
      provider: 'xai',
      accent: 'Male · young · Bengali',
      styles: ['friendly', 'energetic', 'support', 'professional'],
    },
    {
      id: 'pooja',
      label: 'Pooja',
      provider: 'xai',
      accent: 'Female · Bengali',
      styles: ['warm', 'friendly', 'conversational', 'support'],
    },
    {
      id: 'anika',
      label: 'Anika',
      provider: 'xai',
      accent: 'Female · young · Bengali',
      styles: ['bright', 'helpful', 'energetic', 'conversational'],
    },
    {
      id: 'tanvir',
      label: 'Tanvir',
      provider: 'xai',
      accent: 'Male · Bengali',
      styles: ['calm', 'professional', 'confident', 'instructional'],
    },
  ],
  'gemini-tts': [
    {
      id: 'news-bn',
      label: 'News-anchor',
      provider: 'gemini-tts',
      accent: 'BD · female',
      styles: ['news'],
    },
    {
      id: 'operator-bn',
      label: 'Operator',
      provider: 'gemini-tts',
      accent: 'BD · male',
      styles: ['ivr'],
    },
  ],
}

const PROVIDER_LABEL: Record<string, string> = {
  cartesia: 'Cartesia Sonic-2',
  eleven: 'ElevenLabs',
  'gemini-live': 'Gemini Live',
  xai: 'xAI Grok Voice',
  'gemini-tts': 'Gemini TTS · cached',
}

// Which voice providers are available for each tier. The voice service
// fundamentally can only use matching realtime voices in live modes and only
// pre-rendered TTS in dtmf mode, so we hide invalid combinations.
const PROVIDERS_BY_TIER: Record<Tier, string[]> = {
  pipeline: ['cartesia', 'eleven'],
  gemini_live: ['gemini-live'],
  grok_voice: ['xai'],
  dtmf: ['gemini-tts'],
}

const DEFAULT_DTMF: DtmfConfig = {
  menu: [
    { key: '1', label: 'Sales', action: 'transfer:+8801700000001' },
    { key: '2', label: 'Support', action: 'transfer:+8801700000002' },
    { key: '0', label: 'Operator', action: 'transfer:+8801700000003' },
  ],
  maxAttempts: 3,
  interDigitTimeoutMs: 2500,
  terminator: '#',
  noInputPromptUrl: '',
}

const DENOISE_MODES = [
  { k: 'none', label: 'Remove noise' },
  { k: 'mixed', label: 'Remove noise + background speech' },
  { k: 'off', label: 'No denoising' },
] as const

const TRANSCRIPTION_MODES: { k: 'speed' | 'accuracy' | 'custom'; label: string; sub?: string }[] = [
  { k: 'speed', label: 'Optimize for speed', sub: '(Provider Config)' },
  { k: 'accuracy', label: 'Optimize for accuracy', sub: '(Provider Config)' },
  { k: 'custom', label: 'Custom Settings' },
]

const VOCAB_MODES = [
  { k: 'general', label: 'General', sub: '(Works well across most industries)' },
  { k: 'medical', label: 'Medical', sub: '(Optimized for healthcare terms)' },
] as const

const DEFAULT_OUTCOME_LABELS: OutcomeLabel[] = [
  {
    key: 'interested',
    label: 'Interested',
    description: 'Caller showed buying intent or asked for next steps.',
    conversion: true,
  },
  {
    key: 'not_interested',
    label: 'Not interested',
    description: 'Caller declined the offer or asked not to proceed.',
    conversion: false,
  },
  {
    key: 'callback_requested',
    label: 'Callback requested',
    description: 'Caller asked to be contacted later.',
    conversion: false,
  },
  {
    key: 'purchased',
    label: 'Purchased',
    description: 'Caller confirmed an order, payment, booking, or purchase.',
    conversion: true,
  },
  {
    key: 'complaint',
    label: 'Complaint',
    description: 'Caller raised a complaint, escalation, refund, or service issue.',
    conversion: false,
  },
  {
    key: 'wrong_number',
    label: 'Wrong number',
    description: 'Caller said this is the wrong person or number.',
    conversion: false,
  },
  {
    key: 'unknown',
    label: 'Unknown',
    description: 'Outcome cannot be confidently determined.',
    conversion: false,
  },
]

function labelFromOutcomeKey(key: string): string {
  const cleaned = key
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (!cleaned) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function isAutoOutcomeLabel(label: OutcomeLabel): boolean {
  return label.label.trim() === '' || label.label.trim() === labelFromOutcomeKey(label.key)
}

function uniqueOutcomeKey(labels: OutcomeLabel[], base: string): string {
  const used = new Set(labels.map((label) => label.key))
  if (!used.has(base)) return base
  for (let i = 2; i <= 12; i += 1) {
    const next = `${base}_${i}`
    if (!used.has(next)) return next
  }
  return base
}

function normalizeOutcomeLabels(labels?: OutcomeLabel[] | null): OutcomeLabel[] {
  const cleaned = (labels?.length ? labels : DEFAULT_OUTCOME_LABELS)
    .map((label) => ({
      key: String(label.key || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, ''),
      label: String(label.label || '').trim(),
      description: String(label.description || '').trim(),
      conversion: Boolean(label.conversion),
    }))
    .filter((label) => label.key && label.label)
    .slice(0, 12)
  if (!cleaned.some((label) => label.key === 'unknown')) {
    cleaned.push({ ...DEFAULT_OUTCOME_LABELS[6] })
  }
  return cleaned.slice(0, 12)
}

function normalizeOutcomeConfig(config?: OutcomeConfig | null): OutcomeConfig {
  return {
    enabled: config?.enabled !== false,
    labels: normalizeOutcomeLabels(config?.labels),
  }
}

export function AgentEditor({
  initial,
  kbs,
  numbers,
}: {
  initial: AgentDto
  kbs: KbOption[]
  numbers: NumberOption[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const normalizedInitialOutcome = useMemo(
    () => normalizeOutcomeConfig(initial.outcomeConfig),
    [initial.outcomeConfig],
  )

  // Persisted form state (round-trips through /api/agents/:id)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [tier, setTier] = useState<Tier>(initial.tier)
  const [model, setModel] = useState(initial.model || MODEL_OPTIONS[initial.tier]?.[0]?.k || '')
  const [language, setLanguage] = useState(initial.language)
  const initialProvider =
    initial.voice?.provider && PROVIDERS_BY_TIER[initial.tier]?.includes(initial.voice.provider)
      ? initial.voice.provider
      : (PROVIDERS_BY_TIER[initial.tier]?.[0] ?? 'cartesia')
  const [voiceProvider, setVoiceProvider] = useState(initialProvider)
  const [voiceId, setVoiceId] = useState(
    initial.voice?.voiceId || VOICE_CATALOG[initialProvider]?.[0]?.id || '',
  )
  const [voiceStyle, setVoiceStyle] = useState(
    initial.voice?.style || VOICE_CATALOG[initialProvider]?.[0]?.styles?.[0] || 'conversational',
  )
  const [systemPrompt, setSystemPrompt] = useState(
    initial.prompt?.system || (initial.tier === 'dtmf' ? '' : DEFAULT_PROMPT),
  )
  const [firstMessage, setFirstMessage] = useState(initial.prompt?.firstMessage || '')
  const [guardrails, setGuardrails] = useState(initial.prompt?.guardrails || '')
  const [webhook, setWebhook] = useState(initial.postCallWebhook || '')
  const [selectedKbs, setSelectedKbs] = useState<string[]>(initial.knowledgeBaseIds || [])
  const [tools, setTools] = useState<AgentTool[]>(
    (initial.tools || []).map((t) => ({
      name: t.name || '',
      description: t.description || '',
      method: t.method || 'POST',
      url: t.url || '',
      headers: t.headers || {},
      authHeader: t.authHeader || '',
      authValue: '',
      authValueSet: t.authValueSet || false,
      allowedDomains: t.allowedDomains || [],
      retries: t.retries || 1,
      timeoutMs: t.timeoutMs || 5000,
      enabled: t.enabled !== false,
    })),
  )
  const [status, setStatus] = useState(initial.status)
  const [dtmf, setDtmf] = useState<DtmfConfig>(() => ({
    menu: initial.dtmf?.menu?.length ? (initial.dtmf.menu as DtmfMenuItem[]) : DEFAULT_DTMF.menu,
    maxAttempts: initial.dtmf?.maxAttempts ?? DEFAULT_DTMF.maxAttempts,
    interDigitTimeoutMs: initial.dtmf?.interDigitTimeoutMs ?? DEFAULT_DTMF.interDigitTimeoutMs,
    terminator: initial.dtmf?.terminator ?? DEFAULT_DTMF.terminator,
    noInputPromptUrl: initial.dtmf?.noInputPromptUrl ?? DEFAULT_DTMF.noInputPromptUrl,
  }))

  // Cosmetic-only fields (no backing column yet — used to mirror Retell's controls)
  const runtime = initial.runtimeSettings || {}
  const [welcomeMode, setWelcomeMode] = useState<'ai' | 'caller' | 'silent'>(
    runtime.welcomeMode || 'ai',
  )
  const [welcomeKind, setWelcomeKind] = useState<'static' | 'dynamic'>(
    runtime.welcomeKind || 'dynamic',
  )
  const [pauseBefore, setPauseBefore] = useState(runtime.pauseBeforeSpeakingSec ?? 0)
  const [denoise, setDenoise] = useState<'none' | 'mixed' | 'off'>(runtime.denoiseMode || 'none')
  const [transMode, setTransMode] = useState<'speed' | 'accuracy' | 'custom'>(
    runtime.transcriptionMode || 'accuracy',
  )
  const [vocab, setVocab] = useState<'general' | 'medical'>(runtime.vocabularyMode || 'general')
  const [boosted, setBoosted] = useState(runtime.boostedKeywords || '')
  const [voicemailDetect, setVoicemailDetect] = useState(Boolean(runtime.voicemailDetection))
  const [ivrHangup, setIvrHangup] = useState(Boolean(runtime.ivrHangup))
  const [keypadInput, setKeypadInput] = useState(runtime.keypadInput !== false)
  const [timeoutSec, setTimeoutSec] = useState(runtime.keypadTimeoutSec ?? 2.5)
  const [terminationKey, setTerminationKey] = useState(Boolean(runtime.terminationKey))
  const [digitLimit, setDigitLimit] = useState(Boolean(runtime.digitLimit))
  const [endSilence, setEndSilence] = useState(runtime.endSilenceMin ?? 10)
  const [maxDuration, setMaxDuration] = useState(runtime.maxDurationHours ?? 1)
  const [handoffTarget, setHandoffTarget] = useState(runtime.handoffTarget || '')
  const [handoffRules, setHandoffRules] = useState(runtime.handoffRules || '')
  const [geminiLiveVadSilenceMs, setGeminiLiveVadSilenceMs] = useState(
    runtime.geminiLiveVadSilenceMs ?? 600,
  )
  const [geminiKbToolTimeoutMs, setGeminiKbToolTimeoutMs] = useState(
    runtime.geminiKbToolTimeoutMs ?? 1200,
  )
  const [geminiMemoryEnabled, setGeminiMemoryEnabled] = useState(
    runtime.geminiMemoryEnabled !== false,
  )
  const [geminiKbCacheEnabled, setGeminiKbCacheEnabled] = useState(
    runtime.geminiKbCacheEnabled !== false,
  )
  const [outcomeEnabled, setOutcomeEnabled] = useState(normalizedInitialOutcome.enabled)
  const [outcomeLabels, setOutcomeLabels] = useState<OutcomeLabel[]>(
    normalizedInitialOutcome.labels,
  )

  const [pending, start] = useTransition()
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [tab, setTab] = useState<'create' | 'simulation'>('create')
  const [testOpen, setTestOpen] = useState(false)
  const [testMode, setTestMode] = useState<TestRunMode>('browser')
  const [browserTestStatus, setBrowserTestStatus] = useState<BrowserTestStatus>('idle')
  const [browserTestCallId, setBrowserTestCallId] = useState('')
  const [browserTranscript, setBrowserTranscript] = useState<LiveTranscriptTurn[]>([])
  const [builderOpen, setBuilderOpen] = useState(false)
  const [testPanel, setTestPanel] = useState<'audio' | 'llm' | 'json'>('audio')
  const [toE164, setToE164] = useState('')
  const [fromE164, setFromE164] = useState(numbers[0]?.e164 ?? '')
  const [llmInput, setLlmInput] = useState('Hi, I want to know your pricing.')
  const [llmTesting, setLlmTesting] = useState(false)
  const [llmResult, setLlmResult] = useState<LlmTestResult | null>(null)
  const [llmMessages, setLlmMessages] = useState<LlmChatMessage[]>([])
  const [toolTesting, setToolTesting] = useState<number | null>(null)
  const [toolResults, setToolResults] = useState<Record<number, string>>({})
  const browserAudioRef = useRef<BrowserAudioSession | null>(null)
  const browserTranscriptEndRef = useRef<HTMLDivElement | null>(null)
  const persistedBrowserTranscriptRef = useRef<Set<string>>(new Set())

  // Open accordions (matches the Retell screenshot defaults)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    functions: false,
    knowledge: false,
    speech: false,
    realtime: true,
    callSettings: true,
    webhook: false,
    handoff: false,
    outcomes: false,
    dtmfFlow: true,
  })
  const toggleSec = (k: string) => setOpenSections((s) => ({ ...s, [k]: !s[k] }))

  useEffect(() => {
    browserTranscriptEndRef.current?.scrollIntoView({ block: 'end' })
  }, [browserTranscript])

  // When the engine changes, reset model + voice provider + voice id to the
  // first valid option so we never persist an out-of-range combo.
  useEffect(() => {
    const validModels = MODEL_OPTIONS[tier]
    if (!validModels.find((m) => m.k === model)) {
      setModel(validModels[0]?.k ?? '')
    }
    const validProviders = PROVIDERS_BY_TIER[tier]
    if (!validProviders.includes(voiceProvider)) {
      const nextProv = validProviders[0]
      setVoiceProvider(nextProv)
      const firstVoice = VOICE_CATALOG[nextProv]?.[0]
      if (firstVoice) {
        setVoiceId(firstVoice.id)
        setVoiceStyle(firstVoice.styles[0] ?? 'conversational')
      }
    }
    const validLanguages = languageOptionsForTier(tier)
    if (!validLanguages.some((l) => l.k === language)) {
      setLanguage(defaultLanguageForTier(tier))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier])

  // Dirty tracking
  const runtimeSettings = {
    welcomeMode,
    welcomeKind,
    pauseBeforeSpeakingSec: pauseBefore,
    denoiseMode: denoise,
    transcriptionMode: transMode,
    vocabularyMode: vocab,
    boostedKeywords: boosted,
    voicemailDetection: voicemailDetect,
    ivrHangup,
    keypadInput,
    keypadTimeoutSec: timeoutSec,
    terminationKey,
    digitLimit,
    endSilenceMin: endSilence,
    maxDurationHours: maxDuration,
    handoffTarget,
    handoffRules,
    geminiLiveVadSilenceMs,
    geminiKbToolTimeoutMs,
    geminiMemoryEnabled,
    geminiKbCacheEnabled,
  }
  const outcomeConfig = {
    enabled: outcomeEnabled,
    labels: normalizeOutcomeLabels(outcomeLabels),
  }
  const initialKey = useMemo(
    () => JSON.stringify({ ...initial, outcomeConfig: normalizedInitialOutcome }),
    [initial, normalizedInitialOutcome],
  )
  const currentKey = JSON.stringify({
    ...initial,
    name,
    description,
    tier,
    model,
    language,
    voice: { provider: voiceProvider, voiceId, style: voiceStyle },
    prompt: { system: systemPrompt, firstMessage, guardrails },
    dtmf,
    knowledgeBaseIds: selectedKbs,
    tools,
    postCallWebhook: webhook,
    runtimeSettings,
    outcomeConfig,
    status,
  })
  const isDirty = currentKey !== initialKey

  function toggleKb(id: string) {
    setSelectedKbs((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  }

  function runtimeSettingsPayload(): RuntimeSettings {
    return {
      welcomeMode,
      welcomeKind,
      pauseBeforeSpeakingSec: pauseBefore,
      denoiseMode: denoise,
      transcriptionMode: transMode,
      vocabularyMode: vocab,
      boostedKeywords: boosted,
      voicemailDetection: voicemailDetect,
      ivrHangup,
      keypadInput,
      keypadTimeoutSec: timeoutSec,
      terminationKey,
      digitLimit,
      endSilenceMin: endSilence,
      maxDurationHours: maxDuration,
      handoffTarget,
      handoffRules,
      geminiLiveVadSilenceMs,
      geminiKbToolTimeoutMs,
      geminiMemoryEnabled,
      geminiKbCacheEnabled,
    }
  }

  function outcomeConfigPayload(): OutcomeConfig {
    return {
      enabled: outcomeEnabled,
      labels: normalizeOutcomeLabels(outcomeLabels),
    }
  }

  function updateOutcomeLabel(index: number, patch: Partial<OutcomeLabel>) {
    setOutcomeLabels((labels) =>
      labels.map((label, i) => {
        if (i !== index) return label
        const next = { ...label, ...patch }
        if (typeof patch.key === 'string' && isAutoOutcomeLabel(label)) {
          next.label = labelFromOutcomeKey(patch.key)
        }
        return next
      }),
    )
  }

  function addOutcomeLabel() {
    if (outcomeLabels.length >= 12) {
      toast('Revenue outcomes are limited to 12 labels', 'error')
      return
    }
    const key = uniqueOutcomeKey(outcomeLabels, 'new_outcome')
    setOutcomeLabels((labels) => [
      ...labels,
      { key, label: labelFromOutcomeKey(key), description: '', conversion: false },
    ])
  }

  function removeOutcomeLabel(index: number) {
    setOutcomeLabels((labels) => {
      const next = labels.filter((_, i) => i !== index)
      return normalizeOutcomeLabels(next.length ? next : DEFAULT_OUTCOME_LABELS)
    })
  }

  function save(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!name.trim()) {
        toast('Name is required', 'error')
        resolve(false)
        return
      }
      start(async () => {
        try {
          await api.patch(`/api/agents/${initial.id}`, {
            name,
            description,
            tier,
            model,
            language,
            voice: { provider: voiceProvider, voiceId, style: voiceStyle },
            prompt: { system: systemPrompt, firstMessage, guardrails },
            dtmf,
            tools: tools.filter((t) => t.name.trim() && t.url.trim()),
            knowledgeBaseIds: selectedKbs,
            postCallWebhook: webhook,
            runtimeSettings: runtimeSettingsPayload(),
            outcomeConfig: outcomeConfigPayload(),
          })
          setSavedAt(new Date())
          router.refresh()
          resolve(true)
        } catch (e) {
          toast((e as Error).message, 'error')
          resolve(false)
        }
      })
    })
  }

  async function publish() {
    let ok = true
    if (isDirty) ok = await save()
    if (!ok) return
    if (status !== 'live') {
      const missing: string[] = []
      if (!systemPrompt.trim() && !firstMessage.trim()) missing.push('prompt or first message')
      if (!voiceId.trim()) missing.push('voice')
      if (tier === 'dtmf') {
        const validMenu = dtmf.menu.filter((m) => m.key.trim() && m.action.trim())
        if (validMenu.length === 0) missing.push('at least one DTMF key/action')
        const duplicateKeys = new Set<string>()
        for (const row of validMenu) {
          const key = row.key.trim()
          if (duplicateKeys.has(key)) missing.push(`duplicate DTMF key ${key}`)
          duplicateKeys.add(key)
        }
      }
      for (const tool of tools) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tool.name))
          missing.push(`valid tool name for ${tool.name || 'tool'}`)
        if (tool.url && !/^https?:\/\//.test(tool.url))
          missing.push(`valid URL for tool ${tool.name}`)
      }
      if (webhook && !/^https?:\/\//.test(webhook)) missing.push('valid webhook URL')
      if (missing.length) {
        toast(`Cannot publish: add ${missing.join(', ')}`, 'error')
        return
      }
    }
    start(async () => {
      try {
        const next = status === 'live' ? 'draft' : 'live'
        await api.patch(`/api/agents/${initial.id}`, { status: next })
        setStatus(next)
        toast(next === 'live' ? 'Agent is live' : 'Agent moved to draft', 'success')
        router.refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  function stopBrowserTest(showToast = false) {
    const session = browserAudioRef.current
    browserAudioRef.current = null
    closeBrowserAudioSession(session)
    setBrowserTestStatus('idle')
    setBrowserTestCallId('')
    if (showToast) toast('Browser test stopped', 'success')
  }

  function resetBrowserTranscript() {
    persistedBrowserTranscriptRef.current.clear()
    setBrowserTranscript([])
  }

  function handleBrowserTranscriptTurn(
    callId: string,
    turn: LiveTranscriptTurn,
    persist = true,
  ) {
    const text = turn.text.trim()
    if (!text) return
    const normalized = { ...turn, text }
    setBrowserTranscript((items) => {
      const base =
        normalized.final && normalized.role === 'user'
          ? items.filter((item) => item.id !== USER_INTERIM_TURN_ID)
          : items
      const existing = base.findIndex((item) => item.id === normalized.id)
      if (existing >= 0) {
        const next = [...base]
        next[existing] = normalized
        return next.slice(-80)
      }
      return [...base, normalized].slice(-80)
    })

    if (!persist || !normalized.final || !callId) return
    if (persistedBrowserTranscriptRef.current.has(normalized.id)) return
    persistedBrowserTranscriptRef.current.add(normalized.id)
    void api
      .post(`/api/calls/${callId}/transcript`, {
        role: normalized.role,
        text: normalized.text,
        at: normalized.at,
        clientTurnId: normalized.id,
      })
      .catch(() => {
        persistedBrowserTranscriptRef.current.delete(normalized.id)
      })
  }

  async function runBrowserTest() {
    if (browserTestStatus === 'live') {
      stopBrowserTest(true)
      return
    }
    if (browserTestStatus === 'connecting') return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('Browser microphone access is not available in this browser', 'error')
      return
    }
    if (typeof AudioContext === 'undefined') {
      toast('Browser audio is not available in this browser', 'error')
      return
    }
    if (isDirty) {
      const ok = await save()
      if (!ok) return
    }

    const audioSession: BrowserAudioSession = { playbackTime: 0, outputSampleRate: 16000 }
    resetBrowserTranscript()
    setBrowserTestStatus('connecting')
    setTab('simulation')
    setTestPanel('audio')

    try {
      const session = await api.post<BrowserTestStartResult>(
        `/api/agents/${initial.id}/browser-test`,
        {},
      )
      if (session.transport === 'small-webrtc') {
        await connectBrowserWebrtcSession(session, audioSession, {
          onDisconnected: () => {
            if (browserAudioRef.current !== audioSession) return
            browserAudioRef.current = null
            closeBrowserAudioSession(audioSession, false)
            setBrowserTestStatus('idle')
            setBrowserTestCallId('')
          },
          onError: () => {
            if (browserAudioRef.current !== audioSession) return
            toast('Browser test disconnected', 'error')
            stopBrowserTest(false)
          },
          onTranscript: (turn) => handleBrowserTranscriptTurn(session.callId, turn, true),
        })

        closeBrowserAudioSession(browserAudioRef.current)
        browserAudioRef.current = audioSession
        setBrowserTestStatus('live')
        setBrowserTestCallId(session.callId)
        setTestOpen(false)
        toast('Browser test connected in this tab', 'success')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      audioSession.stream = stream
      const context = new AudioContext()
      audioSession.context = context
      await context.resume()
      if (!session.wsUrl) throw new Error('Browser voice test websocket is not configured')
      const socket = new WebSocket(session.wsUrl)
      audioSession.socket = socket
      socket.binaryType = 'arraybuffer'
      await waitForSocketOpen(socket)

      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const inputSampleRate = session.inputSampleRate || 16000
      audioSession.source = source
      audioSession.processor = processor
      audioSession.outputSampleRate = session.outputSampleRate || 16000

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) return
        const input = event.inputBuffer.getChannelData(0)
        const resampled = resampleFloat32(input, context.sampleRate, inputSampleRate)
        const pcm = floatTo16BitPcm(resampled)
        if (pcm.byteLength > 0) socket.send(pcm)
      }
      source.connect(processor)
      processor.connect(context.destination)

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const turn = parseBrowserTranscriptMessage(event.data)
          if (turn) handleBrowserTranscriptTurn(session.callId, turn, false)
          return
        }
        if (event.data instanceof ArrayBuffer) {
          playPcmChunk(audioSession, event.data)
          return
        }
        if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buffer) => playPcmChunk(audioSession, buffer))
        }
      }
      socket.onclose = () => {
        if (browserAudioRef.current !== audioSession) return
        browserAudioRef.current = null
        closeBrowserAudioSession(audioSession, false)
        setBrowserTestStatus('idle')
        setBrowserTestCallId('')
      }
      socket.onerror = () => {
        if (browserAudioRef.current !== audioSession) return
        toast('Browser test disconnected', 'error')
        stopBrowserTest(false)
      }

      closeBrowserAudioSession(browserAudioRef.current)
      browserAudioRef.current = audioSession
      setBrowserTestStatus('live')
      setBrowserTestCallId(session.callId)
      setTestOpen(false)
      toast('Browser test connected in this tab', 'success')
    } catch (e) {
      closeBrowserAudioSession(audioSession)
      setBrowserTestStatus('idle')
      setBrowserTestCallId('')
      toast((e as Error).message || 'Could not start browser test', 'error')
    }
  }

  function runTestCall() {
    if (!/^\+\d{8,15}$/.test(toE164)) {
      toast('Enter a valid E.164 number (e.g. +8801711000000)', 'error')
      return
    }
    stopBrowserTest(false)
    start(async () => {
      try {
        await api.post(`/api/agents/${initial.id}/test-call`, {
          toE164,
          fromE164: fromE164 || undefined,
        })
        toast('Test call originated — watch the call log', 'success')
        setTestOpen(false)
        setToE164('')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  async function runLlmTest() {
    const message = llmInput.trim()
    if (!message) {
      toast('Enter a caller message to test', 'error')
      return
    }
    if (isDirty) {
      const ok = await save()
      if (!ok) return
    }
    stopBrowserTest(false)
    const callerMessage: LlmChatMessage = { role: 'caller', text: message }
    const previousMessages = llmMessages
    const nextMessages = [...previousMessages, callerMessage]
    setLlmMessages(nextMessages)
    setLlmInput('')
    setLlmTesting(true)
    try {
      const result = await api.post<LlmTestResult>(`/api/agents/${initial.id}/llm-test`, {
        messages: nextMessages,
      })
      setLlmResult(result)
      setLlmMessages([...nextMessages, { role: 'agent', text: result.response }])
    } catch (e) {
      setLlmMessages(previousMessages)
      setLlmInput(message)
      toast((e as Error).message, 'error')
    } finally {
      setLlmTesting(false)
    }
  }

  function clearLlmChat() {
    setLlmMessages([])
    setLlmResult(null)
    setLlmInput('')
  }

  async function testTool(index: number) {
    if (isDirty) {
      const ok = await save()
      if (!ok) return
    }
    setToolTesting(index)
    try {
      const result = await api.post<{ ok: boolean; status: number; body: string }>(
        `/api/agents/${initial.id}/tools/test`,
        {
          index,
          arguments: { query: 'dashboard test', notes: 'Manual tool test from agent builder' },
        },
      )
      setToolResults((current) => ({
        ...current,
        [index]: `${result.ok ? 'OK' : 'Failed'} ${result.status}\n${result.body || '(empty response)'}`,
      }))
    } catch (e) {
      setToolResults((current) => ({ ...current, [index]: (e as Error).message }))
    } finally {
      setToolTesting(null)
    }
  }

  function remove() {
    if (!confirm('Delete this agent? This cannot be undone.')) return
    start(async () => {
      try {
        await api.del(`/api/agents/${initial.id}`)
        toast('Agent deleted', 'success')
        router.push('/agents')
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  // Auto-save 1.2s after edits stop
  const dirtyRef = useRef(isDirty)
  dirtyRef.current = isDirty
  const saveDeps = [
    name,
    description,
    tier,
    model,
    language,
    voiceProvider,
    voiceId,
    voiceStyle,
    systemPrompt,
    firstMessage,
    guardrails,
    webhook,
    selectedKbs.join(','),
    JSON.stringify(tools),
    JSON.stringify(dtmf),
    JSON.stringify(runtimeSettings),
    JSON.stringify(outcomeConfig),
  ].join('|')
  useEffect(() => {
    if (!dirtyRef.current) return
    const t = setTimeout(() => {
      if (dirtyRef.current) void save()
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveDeps])

  useEffect(() => {
    return () => {
      closeBrowserAudioSession(browserAudioRef.current)
      browserAudioRef.current = null
    }
  }, [])

  const engineDef = ENGINE_OPTIONS.find((e) => e.k === tier) ?? ENGINE_OPTIONS[0]
  const languageOptions = languageOptionsForTier(tier)
  const langDef = languageOptions.find((l) => l.k === language) ?? languageOptions[0]
  const availableVoices = VOICE_CATALOG[voiceProvider] ?? []
  const voiceDef = availableVoices.find((v) => v.id === voiceId) ?? availableVoices[0]
  const availableModels = MODEL_OPTIONS[tier]
  const modelDef = availableModels.find((m) => m.k === model) ?? availableModels[0]
  const availableProviders = PROVIDERS_BY_TIER[tier]
  const availableStyles = voiceDef?.styles ?? []

  // Tier-aware visibility flags. The voice service can fundamentally only
  // accept these surfaces in each tier, so we hide the panels that don't apply
  // rather than letting the user configure values that will be ignored.
  const showLlmTools = tier !== 'dtmf'
  const showVoiceToolbar = tier !== 'dtmf'
  const showRealtimeStt = tier === 'pipeline'
  const showDtmfFlow = tier === 'dtmf'
  const showSpeechSettings = tier !== 'dtmf'
  const promptIssues = [
    !systemPrompt.trim() && 'Add a system prompt.',
    systemPrompt.split(/\s+/).filter(Boolean).length > 800 &&
      'Shorten the system prompt for lower latency.',
    !/transfer|handoff|human|মানুষ|ম্যানেজার/i.test(`${systemPrompt}\n${handoffRules}`) &&
      'Add escalation or handoff rules.',
    !/record|recorded|রেকর্ড/i.test(`${firstMessage}\n${guardrails}`) &&
      'Mention recording disclosure when calls are recorded.',
    !/otp|pin|password|card|পিন|ওটিপি/i.test(guardrails) &&
      'Add sensitive-data guardrails for OTP/PIN/card/password.',
  ].filter(Boolean) as string[]

  const idShort = `ag_…${initial.id.slice(-4)}`
  const modelShortLabel = modelDef?.label ?? '—'
  const costPerMin = modelDef?.costPerMin ?? '—'
  const latency = modelDef?.latency ?? '—'
  const tokenBudget = modelDef?.tokenBudget ?? '—'

  return (
    <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
      {/* Top header */}
      <div className="border-line bg-bg flex items-center gap-2 border-b px-3 py-2">
        <Link
          href="/agents"
          className="text-fg grid size-8 shrink-0 place-items-center rounded-[5px] bg-[#fbe5cf] transition hover:bg-[#f6d3b3]"
          aria-label="Back to agents"
        >
          <Icon name="dashboard" size="sm" />
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-fg placeholder:text-fg-faint min-w-0 flex-1 truncate bg-transparent text-[14px] font-semibold outline-none focus:ring-0"
            placeholder="Untitled agent"
            aria-label="Agent name"
          />
          <span className="text-fg-muted hidden whitespace-nowrap text-[12.5px] md:inline">
            (from template)
          </span>
          <button
            type="button"
            className="text-fg-muted hover:bg-bg-muted hover:text-fg grid size-6 shrink-0 place-items-center rounded transition"
            aria-label="Rename"
          >
            <PencilIcon />
          </button>
        </div>

        <div className="border-line bg-bg hidden items-center gap-1 rounded-[5px] border p-0.5 md:flex">
          <SegTab active={tab === 'create'} onClick={() => setTab('create')}>
            Create
          </SegTab>
          <SegTab active={tab === 'simulation'} onClick={() => setTab('simulation')}>
            Simulation
          </SegTab>
        </div>

        <div className="ml-1 flex items-center gap-1">
          <span className="text-fg-muted hidden whitespace-nowrap text-[11.5px] md:inline">
            {pending
              ? 'Saving…'
              : savedAt
                ? `Auto saved at ${formatTime(savedAt)}`
                : isDirty
                  ? 'Unsaved changes'
                  : 'Auto saved'}
          </span>
          <IconBtn name="more-horizontal" label="More" />
          <IconBtn name="code" label="Copy ID" />
          <IconBtn name="clock" label="Version history" />
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className="ml-1 inline-flex h-8 items-center gap-1 rounded-full border border-[#D2D4D6] bg-[#F5F5F7] px-3 text-[12.5px] font-medium text-fg transition hover:bg-[#ECEDEF] disabled:opacity-60"
          >
            {status === 'live' ? 'Move to draft' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Meta strip */}
      <div className="border-line border-b bg-[#fff7eb] px-3 py-1.5">
        <div className="text-fg-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <Meta label="Agent ID" value={idShort} />
          <Sep />
          <Meta label="Engine" value={`${engineDef.label} · ${modelShortLabel}`} />
          <Sep />
          <Meta value={`${costPerMin}/min`} icon="currency" />
          <Sep />
          <Meta value={`${latency} latency`} icon="clock" />
          <Sep />
          <Meta value={tokenBudget} icon="hash" />
        </div>
      </div>

      {/* Toolbar (engine / model / voice / language) */}
      <div className="border-line bg-bg flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
        <ToolSelect
          name="zap"
          label={engineDef.label}
          tag={engineDef.suggested ? 'Suggested' : undefined}
          options={ENGINE_OPTIONS.map((o) => ({
            k: o.k,
            label: o.label,
            sub: o.sub,
            badge: o.suggested ? 'Suggested' : undefined,
          }))}
          value={tier}
          onChange={(v) => setTier(v as Tier)}
        />
        {showLlmTools && availableModels.length > 0 && (
          <ToolSelect
            name="cpu"
            label={modelDef?.label ?? availableModels[0].label}
            tag={modelDef?.badge}
            options={availableModels.map((m) => ({
              k: m.k,
              label: m.label,
              sub: m.sub,
              badge: m.badge,
            }))}
            value={model}
            onChange={setModel}
          />
        )}
        <IconBtn name="settings" label="Engine settings" />
        <IconBtn name="sparkles" label="AI Agent Builder" onClick={() => setBuilderOpen(true)} />

        {showVoiceToolbar && availableVoices.length > 0 && (
          <>
            {availableProviders.length > 1 && (
              <ToolSelect
                name="wave"
                label={PROVIDER_LABEL[voiceProvider] ?? voiceProvider}
                options={availableProviders.map((p) => ({
                  k: p,
                  label: PROVIDER_LABEL[p] ?? p,
                  sub: `${VOICE_CATALOG[p]?.length ?? 0} voices`,
                }))}
                value={voiceProvider}
                onChange={(v) => {
                  setVoiceProvider(v)
                  const first = VOICE_CATALOG[v]?.[0]
                  if (first) {
                    setVoiceId(first.id)
                    setVoiceStyle(first.styles[0] ?? 'conversational')
                  }
                }}
              />
            )}
            <ToolSelect
              name="speaker"
              label={voiceDef?.label ?? availableVoices[0].label}
              avatar
              options={availableVoices.map((o) => ({ k: o.id, label: o.label, sub: o.accent }))}
              value={voiceId}
              onChange={(v) => {
                const def = availableVoices.find((x) => x.id === v)
                setVoiceId(v)
                if (def && !def.styles.includes(voiceStyle)) {
                  setVoiceStyle(def.styles[0] ?? 'conversational')
                }
              }}
            />
          </>
        )}
        <ToolSelect
          name="globe"
          label={langDef.label}
          options={languageOptions.map((o) => ({ k: o.k, label: o.label }))}
          value={language}
          onChange={setLanguage}
        />

        <span className="text-fg-muted ml-auto inline-flex items-center gap-1 text-[12.5px]">
          <button
            type="button"
            onClick={() => setOpenSections((s) => ({ ...s, handoff: true }))}
            className="hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 transition"
          >
            <Icon name="route" size="xs" /> Agent Handoff
          </button>
        </span>
      </div>

      {/* Body — 3 columns */}
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)_minmax(220px,260px)] lg:overflow-hidden">
        {/* LEFT — prompt editor */}
        <div className="bg-bg flex min-w-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              spellCheck={false}
              className="text-fg block h-full min-h-[60vh] w-full resize-none border-0 bg-transparent px-5 py-4 font-mono text-[12.5px] leading-[1.65] outline-none focus:ring-0"
              placeholder={
                '## Identity\nYou are…\n\n## Style Guardrails\n- Be concise\n\n## Task\n1. …'
              }
            />
            {promptIssues.length > 0 && (
              <div className="border-line bg-status-warn/5 border-t px-5 py-3">
                <p className="text-status-warn mb-1 text-[11.5px] font-medium">Prompt checks</p>
                <ul className="text-fg-muted space-y-1 text-[12px]">
                  {promptIssues.map((issue) => (
                    <li key={issue} className="flex gap-1.5">
                      <span className="text-status-warn">-</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div>
            <Label>From number</Label>
            <select
              value={fromE164}
              onChange={(e) => setFromE164(e.target.value)}
              className="border-line bg-bg-subtle mt-2 h-10 w-full rounded border px-3 text-sm"
            >
              <option value="">Auto-select outbound number</option>
              {numbers.map((n) => (
                <option key={n.id} value={n.e164}>
                  {n.e164} {n.providerName ? `· ${n.providerName}` : ''}
                </option>
              ))}
            </select>
          </div>
          {/* Welcome message footer */}
          <div className="border-line bg-bg border-t px-4 py-3">
            <p className="text-fg mb-2 text-[11.5px] font-medium">Welcome Message</p>
            <div className="flex flex-wrap items-center gap-2">
              <FooterSelect
                value={welcomeMode}
                onChange={(v) => setWelcomeMode(v as 'ai' | 'caller' | 'silent')}
                options={[
                  { k: 'ai', label: 'AI speaks first' },
                  { k: 'caller', label: 'Caller speaks first' },
                  { k: 'silent', label: 'Silent until prompted' },
                ]}
              />
              <span className="border-line bg-bg text-fg-muted inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1.5 text-[12px]">
                <span>Pause Before Speaking:</span>
                <span className="text-fg font-mono">{pauseBefore}s</span>
                <button
                  type="button"
                  onClick={() => setPauseBefore((v) => Math.max(0, v - 1))}
                  className="text-fg-muted hover:text-fg"
                  aria-label="decrement"
                >
                  <Icon name="chevron-left" size="xs" />
                </button>
                <button
                  type="button"
                  onClick={() => setPauseBefore((v) => Math.min(30, v + 1))}
                  className="text-fg-muted hover:text-fg"
                  aria-label="increment"
                >
                  <Icon name="chevron-right" size="xs" />
                </button>
              </span>
              <FooterSelect
                value={welcomeKind}
                onChange={(v) => setWelcomeKind(v as 'static' | 'dynamic')}
                options={[
                  { k: 'dynamic', label: 'Dynamic message' },
                  { k: 'static', label: 'Static message' },
                ]}
              />
            </div>
            {welcomeKind === 'static' && (
              <Textarea
                rows={2}
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                placeholder="Hello — this is your agent."
                className="font-bangla mt-2 text-[13px]"
              />
            )}
          </div>
        </div>

        {/* MIDDLE — accordion config */}
        <aside className="border-line bg-bg-subtle/50 flex min-w-0 flex-col overflow-y-auto border-t lg:border-l lg:border-t-0">
          <Accordion
            label="Functions"
            icon="zap"
            open={openSections.functions}
            onToggle={() => toggleSec('functions')}
          >
            <p className="text-fg-muted text-[12px]">
              Add tools the model can call mid-conversation (transfers, lookups, webhooks).
            </p>
            <div className="mt-2 grid gap-2">
              {tools.map((tool, i) => (
                <div key={i} className="border-line bg-bg rounded-[5px] border p-2">
                  <div className="grid gap-1.5">
                    <p className="text-fg-faint text-[11px]">
                      Tool calls are logged with secrets redacted. Use allowed domains to prevent
                      prompt-injected calls to unknown hosts.
                    </p>
                    <Input
                      value={tool.name}
                      onChange={(e) =>
                        setTools((xs) =>
                          xs.map((t, j) => (j === i ? { ...t, name: e.target.value } : t)),
                        )
                      }
                      placeholder="lookup_order"
                    />
                    <Input
                      value={tool.description}
                      onChange={(e) =>
                        setTools((xs) =>
                          xs.map((t, j) => (j === i ? { ...t, description: e.target.value } : t)),
                        )
                      }
                      placeholder="Lookup order or appointment status"
                    />
                    <div className="grid grid-cols-[90px_1fr] gap-1.5">
                      <select
                        value={tool.method}
                        onChange={(e) =>
                          setTools((xs) =>
                            xs.map((t, j) =>
                              j === i ? { ...t, method: e.target.value as AgentTool['method'] } : t,
                            ),
                          )
                        }
                        className="border-line bg-bg-subtle h-9 rounded border px-2 text-[12px]"
                      >
                        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={tool.url}
                        onChange={(e) =>
                          setTools((xs) =>
                            xs.map((t, j) => (j === i ? { ...t, url: e.target.value } : t)),
                          )
                        }
                        placeholder="https://api.example.com/lookup"
                      />
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-1.5">
                      <Input
                        value={tool.authHeader}
                        onChange={(e) =>
                          setTools((xs) =>
                            xs.map((t, j) => (j === i ? { ...t, authHeader: e.target.value } : t)),
                          )
                        }
                        placeholder="Authorization"
                      />
                      <Input
                        value={tool.authValue}
                        onChange={(e) =>
                          setTools((xs) =>
                            xs.map((t, j) =>
                              j === i
                                ? {
                                    ...t,
                                    authValue: e.target.value,
                                    authValueSet: Boolean(e.target.value) || t.authValueSet,
                                  }
                                : t,
                            ),
                          )
                        }
                        placeholder={
                          tool.authValueSet
                            ? 'Secret set — enter to replace'
                            : 'Bearer token or API key'
                        }
                        type="password"
                      />
                    </div>
                    <Input
                      value={tool.allowedDomains.join(', ')}
                      onChange={(e) =>
                        setTools((xs) =>
                          xs.map((t, j) =>
                            j === i
                              ? {
                                  ...t,
                                  allowedDomains: e.target.value
                                    .split(',')
                                    .map((x) => x.trim())
                                    .filter(Boolean),
                                }
                              : t,
                          ),
                        )
                      }
                      placeholder="Allowed domains, comma separated"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={3}
                        value={tool.retries}
                        onChange={(e) =>
                          setTools((xs) =>
                            xs.map((t, j) =>
                              j === i
                                ? {
                                    ...t,
                                    retries: Math.max(1, Math.min(3, Number(e.target.value) || 1)),
                                  }
                                : t,
                            ),
                          )
                        }
                        placeholder="Retries"
                      />
                      <Input
                        type="number"
                        min={500}
                        max={30000}
                        step={500}
                        value={tool.timeoutMs}
                        onChange={(e) =>
                          setTools((xs) =>
                            xs.map((t, j) =>
                              j === i
                                ? {
                                    ...t,
                                    timeoutMs: Math.max(
                                      500,
                                      Math.min(30000, Number(e.target.value) || 5000),
                                    ),
                                  }
                                : t,
                            ),
                          )
                        }
                        placeholder="Timeout ms"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-fg-muted flex items-center gap-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={tool.enabled}
                          onChange={(e) =>
                            setTools((xs) =>
                              xs.map((t, j) => (j === i ? { ...t, enabled: e.target.checked } : t)),
                            )
                          }
                        />
                        Enabled
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void testTool(i)}
                          disabled={toolTesting === i || !tool.name || !tool.url}
                          className="text-fg-muted hover:text-fg text-[12px] transition disabled:opacity-50"
                        >
                          {toolTesting === i ? 'Testing...' : 'Test'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTools((xs) => xs.filter((_, j) => j !== i))}
                          className="text-status-fail text-[12px]"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {toolResults[i] && (
                      <pre className="border-line bg-bg-subtle text-fg-muted max-h-32 overflow-auto rounded border p-2 font-mono text-[11px]">
                        {toolResults[i]}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setTools((xs) => [
                  ...xs,
                  {
                    name: '',
                    description: '',
                    method: 'POST',
                    url: '',
                    headers: {},
                    authHeader: '',
                    authValue: '',
                    authValueSet: false,
                    allowedDomains: [],
                    retries: 1,
                    timeoutMs: 5000,
                    enabled: true,
                  },
                ])
              }
              className="border-line bg-bg text-fg hover:bg-bg-muted mt-2 inline-flex items-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[12px] transition"
            >
              <Icon name="plus" size="xs" /> Add function
            </button>
          </Accordion>

          <Accordion
            label="Knowledge Base"
            icon="book"
            open={openSections.knowledge}
            onToggle={() => toggleSec('knowledge')}
          >
            {kbs.length === 0 ? (
              <p className="text-fg-muted text-[12px]">
                No knowledge bases yet. Create one in{' '}
                <Link className="text-fg underline" href="/knowledge">
                  Knowledge
                </Link>
                .
              </p>
            ) : (
              <div className="grid gap-1.5">
                {kbs.map((k) => {
                  const on = selectedKbs.includes(k.id)
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKb(k.id)}
                      className={cn(
                        'flex items-center justify-between rounded-[5px] border px-3 py-2 transition-colors',
                        on ? 'border-fg/40 bg-fg/5' : 'border-line bg-bg hover:border-fg/20',
                      )}
                    >
                      <span className="text-fg truncate text-[12.5px]">{k.name}</span>
                      {on && <Icon name="check" size="xs" />}
                    </button>
                  )
                })}
              </div>
            )}
            {tier === 'gemini_live' && selectedKbs.length > 0 && (
              <p className="text-fg-muted text-[11px]">
                Gemini memory: {initial.geminiMemory?.status ?? 'stale'}
              </p>
            )}
          </Accordion>

          {showSpeechSettings && (
            <Accordion
              label="Speech Settings"
              icon="speaker"
              open={openSections.speech}
              onToggle={() => toggleSec('speech')}
            >
              <Field label="Voice provider">
                <div className="flex flex-wrap gap-1.5">
                  {availableProviders.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setVoiceProvider(p)
                        const first = VOICE_CATALOG[p]?.[0]
                        if (first) {
                          setVoiceId(first.id)
                          setVoiceStyle(first.styles[0] ?? 'conversational')
                        }
                      }}
                        className={cn(
                          'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition',
                          p === voiceProvider
                            ? 'border-[#D2D4D6] bg-[#F5F5F7] text-fg'
                            : 'border-line bg-bg text-fg hover:bg-bg-muted',
                      )}
                    >
                      {PROVIDER_LABEL[p] ?? p}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Voice">
                <div className="grid gap-1.5">
                  {availableVoices.map((v) => {
                    const on = v.id === voiceId
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setVoiceId(v.id)
                          if (!v.styles.includes(voiceStyle)) {
                            setVoiceStyle(v.styles[0] ?? 'conversational')
                          }
                        }}
                        className={cn(
                          'flex items-center justify-between rounded-[5px] border px-3 py-2 transition-colors',
                          on ? 'border-fg/40 bg-fg/5' : 'border-line bg-bg hover:border-fg/20',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="text-fg block truncate text-[12.5px]">{v.label}</span>
                          <span className="text-fg-muted block truncate text-[10.5px]">
                            {v.accent}
                          </span>
                        </span>
                        {on && <Icon name="check" size="xs" />}
                      </button>
                    )
                  })}
                </div>
              </Field>
              {availableStyles.length > 0 && (
                <Field label={tier === 'grok_voice' ? 'Tone' : 'Voice style'}>
                  <div className="flex flex-wrap gap-1.5">
                    {availableStyles.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setVoiceStyle(s)}
                        className={cn(
                          'inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] transition',
                          s === voiceStyle
                            ? 'border-[#D2D4D6] bg-[#F5F5F7] text-fg'
                            : 'border-line bg-bg text-fg hover:bg-bg-muted',
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {tier === 'gemini_live' && (
                <>
                  <Divider />
                  <SubLabel
                    title="Gemini Live latency"
                    hint="Tune turn timing and keep common KB answers on the hot path."
                  />
                  <div className="grid gap-2 md:grid-cols-2">
                    <Field label="VAD silence (ms)">
                      <Input
                        type="number"
                        min={300}
                        max={2000}
                        step={50}
                        value={geminiLiveVadSilenceMs}
                        onChange={(e) =>
                          setGeminiLiveVadSilenceMs(
                            Math.max(300, Math.min(2000, Number(e.target.value) || 600)),
                          )
                        }
                      />
                    </Field>
                    <Field label="KB timeout (ms)">
                      <Input
                        type="number"
                        min={300}
                        max={5000}
                        step={100}
                        value={geminiKbToolTimeoutMs}
                        onChange={(e) =>
                          setGeminiKbToolTimeoutMs(
                            Math.max(300, Math.min(5000, Number(e.target.value) || 1200)),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <ToggleRow
                    title="Gemini memory"
                    hint="Inject a compact KB summary into Live prompts."
                    checked={geminiMemoryEnabled}
                    onChange={setGeminiMemoryEnabled}
                  />
                  <Divider />
                  <ToggleRow
                    title="Gemini KB cache"
                    hint="Prepare large KBs for non-Live fallback jobs."
                    checked={geminiKbCacheEnabled}
                    onChange={setGeminiKbCacheEnabled}
                  />
                </>
              )}
            </Accordion>
          )}

          {showDtmfFlow && (
            <Accordion
              label="DTMF Flow"
              icon="hash"
              open={openSections.dtmfFlow}
              onToggle={() => toggleSec('dtmfFlow')}
            >
              <SubLabel
                title="Menu"
                hint="Caller-pressed key → action. Action can be `transfer:+E.164`, `prompt:<id>`, or `hangup`."
              />
              <div className="grid gap-1.5">
                {dtmf.menu.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={row.key}
                      onChange={(e) =>
                        setDtmf((d) => ({
                          ...d,
                          menu: d.menu.map((m, j) =>
                            j === i ? { ...m, key: e.target.value.slice(0, 4) } : m,
                          ),
                        }))
                      }
                      placeholder="1"
                      className="w-12 text-center font-mono"
                    />
                    <Input
                      value={row.label}
                      onChange={(e) =>
                        setDtmf((d) => ({
                          ...d,
                          menu: d.menu.map((m, j) =>
                            j === i ? { ...m, label: e.target.value } : m,
                          ),
                        }))
                      }
                      placeholder="Sales"
                      className="min-w-0 flex-1"
                    />
                    <Input
                      value={row.action}
                      onChange={(e) =>
                        setDtmf((d) => ({
                          ...d,
                          menu: d.menu.map((m, j) =>
                            j === i ? { ...m, action: e.target.value } : m,
                          ),
                        }))
                      }
                      placeholder="transfer:+880..."
                      className="min-w-0 flex-[2] font-mono text-[11.5px]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDtmf((d) => ({
                          ...d,
                          menu: d.menu.filter((_, j) => j !== i),
                        }))
                      }
                      className="text-fg-muted hover:bg-status-fail/10 hover:text-status-fail grid size-7 shrink-0 place-items-center rounded transition"
                      aria-label="Remove key"
                    >
                      <Icon name="x" size="xs" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setDtmf((d) => ({
                      ...d,
                      menu: [...d.menu, { key: '', label: '', action: '' }],
                    }))
                  }
                  className="border-line bg-bg text-fg hover:bg-bg-muted mt-1 inline-flex w-fit items-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[12px] transition"
                >
                  <Icon name="plus" size="xs" /> Add key
                </button>
              </div>
              <Divider />
              <Field label="Terminator key">
                <Input
                  value={dtmf.terminator}
                  onChange={(e) =>
                    setDtmf((d) => ({ ...d, terminator: e.target.value.slice(0, 1) }))
                  }
                  placeholder="#"
                  className="w-16 text-center font-mono"
                />
              </Field>
              <Field label="Max attempts">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={dtmf.maxAttempts}
                  onChange={(e) =>
                    setDtmf((d) => ({
                      ...d,
                      maxAttempts: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                    }))
                  }
                  className="w-20"
                />
              </Field>
              <Field label="Inter-digit timeout (ms)">
                <Input
                  type="number"
                  min={250}
                  max={15000}
                  step={250}
                  value={dtmf.interDigitTimeoutMs}
                  onChange={(e) =>
                    setDtmf((d) => ({
                      ...d,
                      interDigitTimeoutMs: Math.max(
                        250,
                        Math.min(15000, Number(e.target.value) || 2500),
                      ),
                    }))
                  }
                  className="w-28"
                />
              </Field>
              <Field label="No-input prompt URL">
                <Input
                  value={dtmf.noInputPromptUrl}
                  onChange={(e) => setDtmf((d) => ({ ...d, noInputPromptUrl: e.target.value }))}
                  placeholder="https://your-cdn/no-input.wav"
                  className="font-mono text-[11.5px]"
                />
              </Field>
            </Accordion>
          )}

          {showRealtimeStt && (
            <Accordion
              label="Realtime Transcription Settings"
              icon="wave"
              open={openSections.realtime}
              onToggle={() => toggleSec('realtime')}
            >
              <SubLabel
                title="Denoising Mode"
                hint="Filter out unwanted background noise or speech."
                link="Learn more"
              />
              <RadioGroup
                value={denoise}
                onChange={(v) => setDenoise(v as typeof denoise)}
                options={DENOISE_MODES.map((o) => ({ k: o.k, label: o.label }))}
              />

              <Divider />

              <SubLabel
                title="Transcription Mode"
                hint="Balance between speed and accuracy."
                link="Learn more"
              />
              <RadioGroup
                value={transMode}
                onChange={(v) => setTransMode(v as typeof transMode)}
                options={TRANSCRIPTION_MODES.map((o) => ({
                  k: o.k,
                  label: o.label,
                  sub: o.sub,
                }))}
              />

              <Divider />

              <SubLabel
                title="Vocabulary Specialization"
                hint="Choose the vocabulary set to use for transcription."
              />
              <RadioGroup
                value={vocab}
                onChange={(v) => setVocab(v as typeof vocab)}
                options={VOCAB_MODES.map((o) => ({ k: o.k, label: o.label, sub: o.sub }))}
              />

              <Divider />

              <SubLabel
                title="Boosted Keywords"
                hint="Provide a customized list of keywords to expand our models' vocabulary."
              />
              <Input
                value={boosted}
                onChange={(e) => setBoosted(e.target.value)}
                placeholder="Split by comma. Example: Retell, Wai…"
              />
            </Accordion>
          )}

          <Accordion
            label="Call Settings"
            icon="phone-call"
            open={openSections.callSettings}
            onToggle={() => toggleSec('callSettings')}
          >
            <ToggleRow
              title="Voicemail Detection"
              hint="Hang up or leave a voicemail if a voicemail is detected."
              checked={voicemailDetect}
              onChange={setVoicemailDetect}
            />
            <Divider />
            <ToggleRow
              title="IVR Hangup"
              hint="Hang up if an IVR system is detected."
              checked={ivrHangup}
              onChange={setIvrHangup}
            />
            <Divider />
            <ToggleRow
              title="User Keypad Input Detection"
              hint="Enable the AI to listen for keypad input during a call."
              checked={keypadInput}
              onChange={setKeypadInput}
            />
            {keypadInput && (
              <div className="border-line bg-bg rounded-md border px-3 py-3">
                <p className="text-fg text-[11.5px] font-medium">
                  The AI will respond when any of the following conditions are met:
                </p>
                <div className="mt-3 space-y-3">
                  <SliderRow
                    title="Timeout"
                    hint="The AI will respond if no keypad input is detected within the set time."
                    value={timeoutSec}
                    onChange={setTimeoutSec}
                    min={0.5}
                    max={10}
                    step={0.5}
                    suffix="s"
                  />
                  <ToggleRow
                    title="Termination Key"
                    hint="The AI will respond when the user presses the configured termination key (e.g. #, *)."
                    checked={terminationKey}
                    onChange={setTerminationKey}
                    inset
                  />
                  <ToggleRow
                    title="Digit Limit"
                    hint="The AI will respond immediately after the caller enters the configured number of digits."
                    checked={digitLimit}
                    onChange={setDigitLimit}
                    inset
                  />
                </div>
              </div>
            )}
            <Divider />
            <SliderRow
              title="End Call on Silence"
              hint="End the call if user stays silent for extended period of time."
              value={endSilence}
              onChange={setEndSilence}
              min={1}
              max={60}
              step={1}
              suffix="m"
            />
            <Divider />
            <SliderRow
              title="Max Call Duration"
              hint=""
              value={maxDuration}
              onChange={setMaxDuration}
              min={0.25}
              max={4}
              step={0.25}
              suffix="h"
              format={(v) => v.toFixed(2)}
            />
          </Accordion>

          <Accordion
            label="Revenue outcomes"
            icon="check-badge"
            open={openSections.outcomes}
            onToggle={() => toggleSec('outcomes')}
          >
            <ToggleRow
              title="Extract post-call outcome"
              hint="Adds CRM-ready labels, conversion flags, callback details, and notes after completed calls."
              checked={outcomeEnabled}
              onChange={setOutcomeEnabled}
            />
            <Divider />
            <div className="flex items-center justify-between gap-3">
              <SubLabel
                title="Labels"
                hint={`${outcomeConfig.labels.length}/12 labels. Keep an unknown fallback.`}
              />
              <button
                type="button"
                onClick={addOutcomeLabel}
                className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-7 items-center gap-1.5 rounded-[5px] border px-2 text-[11.5px] font-medium transition"
              >
                <Icon name="plus" size="xs" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {outcomeLabels.map((label, index) => (
                <div
                  key={`${label.key}-${index}`}
                  className="border-line bg-bg-subtle/40 rounded-md border p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="grid gap-2 md:grid-cols-[0.85fr_1fr]">
                        <Field label="Key">
                          <Input
                            className="font-mono text-xs"
                            value={label.key}
                            onChange={(e) => updateOutcomeLabel(index, { key: e.target.value })}
                            placeholder="callback_requested"
                          />
                        </Field>
                        <Field label="Label">
                          <Input
                            value={label.label}
                            onChange={(e) => updateOutcomeLabel(index, { label: e.target.value })}
                            placeholder="Callback requested"
                          />
                        </Field>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOutcomeLabel(index)}
                      className="border-line bg-bg text-fg-muted hover:border-status-fail/30 hover:text-status-fail mt-5 inline-grid size-7 place-items-center rounded-md border transition"
                      aria-label="Remove outcome label"
                    >
                      <Icon name="x" size="xs" />
                    </button>
                  </div>
                  <Field label="Description">
                    <Textarea
                      rows={2}
                      value={label.description}
                      onChange={(e) => updateOutcomeLabel(index, { description: e.target.value })}
                      placeholder="When should this label be selected?"
                    />
                  </Field>
                  <div className="mt-3">
                    <ToggleRow
                      title="Counts as conversion"
                      checked={label.conversion}
                      onChange={(conversion) => updateOutcomeLabel(index, { conversion })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Accordion>

          <Accordion
            label="Webhook"
            icon="route"
            open={openSections.webhook}
            onToggle={() => toggleSec('webhook')}
          >
            <Input
              className="font-mono text-xs"
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://your-app.example/livocall/call-ended"
            />
          </Accordion>

          <Accordion
            label="Agent Handoff"
            icon="route"
            open={openSections.handoff}
            onToggle={() => toggleSec('handoff')}
          >
            <Field label="Target">
              <Input
                value={handoffTarget}
                onChange={(e) => setHandoffTarget(e.target.value)}
                placeholder="Human queue, agent id, or +880..."
              />
            </Field>
            <Field label="Rules">
              <Textarea
                rows={3}
                value={handoffRules}
                onChange={(e) => setHandoffRules(e.target.value)}
                placeholder="Transfer when the caller asks for a person, gets angry, or needs a policy exception."
              />
            </Field>
          </Accordion>

          {(guardrails || description) && (
            <div className="border-line border-t px-5 py-4">
              {description && (
                <>
                  <p className="text-fg-muted mb-1 text-[11.5px] font-medium">
                    Internal description
                  </p>
                  <Textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short summary visible only to your team."
                  />
                </>
              )}
              {guardrails && (
                <>
                  <p className="text-fg-muted mb-1 mt-3 text-[11.5px] font-medium">Guardrails</p>
                  <Textarea
                    rows={3}
                    value={guardrails}
                    onChange={(e) => setGuardrails(e.target.value)}
                  />
                </>
              )}
            </div>
          )}

          <div className="border-line mt-auto border-t px-5 py-3">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="border-status-fail/30 bg-bg text-status-fail hover:bg-status-fail/10 inline-flex h-7 items-center gap-1.5 rounded-[5px] border px-2.5 text-[11.5px] font-medium transition"
            >
              Delete agent
            </button>
          </div>
        </aside>

        {/* RIGHT — test rail */}
        <aside className="border-line bg-bg-subtle/40 flex min-w-0 flex-col border-t lg:border-l lg:border-t-0">
          <div className="border-line flex flex-col items-stretch gap-1.5 border-b px-2 py-2">
            <TestTab
              icon="speaker"
              label="Test Audio"
              active={testPanel === 'audio'}
              onClick={() => setTestPanel('audio')}
            />
            <TestTab
              icon="cpu"
              label="Test LLM"
              active={testPanel === 'llm'}
              onClick={() => setTestPanel('llm')}
            />
            <TestTab
              icon="code"
              label="JSON"
              active={testPanel === 'json'}
              onClick={() => setTestPanel('json')}
            />
          </div>
          {testPanel === 'audio' && (
            <div className="flex min-h-0 flex-1 flex-col items-center gap-3 px-3 py-4">
              <div className="border-line bg-bg shadow-card grid size-16 place-items-center rounded-full border">
                <Icon
                  name={testMode === 'browser' ? 'mic' : 'phone-out'}
                  size="lg"
                  className={cn(
                    browserTestStatus === 'live' && testMode === 'browser'
                      ? 'text-status-live'
                      : 'text-fg-muted',
                  )}
                />
              </div>
              <div className="border-line bg-bg grid w-full grid-cols-2 rounded-[5px] border p-0.5">
                <button
                  type="button"
                  onClick={() => setTestMode('browser')}
                  className={cn(
                    'inline-flex h-7 items-center justify-center gap-1 rounded-[4px] text-[11.5px] font-medium transition',
                    testMode === 'browser'
                      ? 'bg-[#F5F5F7] text-fg shadow-card'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Icon name="globe" size="xs" /> Browser
                </button>
                <button
                  type="button"
                  onClick={() => setTestMode('call')}
                  className={cn(
                    'inline-flex h-7 items-center justify-center gap-1 rounded-[4px] text-[11.5px] font-medium transition',
                    testMode === 'call'
                      ? 'bg-[#F5F5F7] text-fg shadow-card'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Icon name="phone-out" size="xs" /> Call
                </button>
              </div>
              <p className="text-fg-muted text-center text-[11px] leading-snug">
                {testMode === 'browser'
                  ? browserTestStatus === 'live'
                    ? `Webcall live${browserTestCallId ? ` - ${browserTestCallId.slice(-6)}` : ''}. Transfer is not supported.`
                    : 'Runs in this browser with no phone call. Transfer is not supported on Webcall.'
                  : 'Place a real outbound test call to a selected phone number.'}
              </p>
              <button
                type="button"
                onClick={() =>
                  testMode === 'browser' ? void runBrowserTest() : setTestOpen(true)
                }
                disabled={browserTestStatus === 'connecting'}
                className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[5px] border px-2 text-[12.5px] font-medium transition"
              >
                <PlayIcon />{' '}
                {testMode === 'browser'
                  ? browserTestStatus === 'connecting'
                    ? 'Connecting'
                    : browserTestStatus === 'live'
                      ? 'Stop Test'
                      : 'Run Test'
                  : 'Test Call'}
              </button>
              {testMode === 'browser' && (
                <div className="border-line bg-bg flex min-h-[180px] w-full flex-1 flex-col overflow-hidden rounded-[5px] border">
                  <div className="border-line flex items-center justify-between border-b px-3 py-2">
                    <span className="text-fg flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em]">
                      <Icon name="message-square" size="xs" className="text-fg-muted" />
                      Live transcript
                    </span>
                    {browserTranscript.length > 0 && (
                      <span className="text-fg-faint font-mono text-[10px]">
                        {browserTranscript.length}
                      </span>
                    )}
                  </div>
                  <div
                    className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2"
                    aria-live="polite"
                  >
                    {browserTranscript.length === 0 ? (
                      <div className="grid h-full min-h-24 place-items-center">
                        <p className="text-fg-faint text-center text-[12px]">Waiting for speech...</p>
                      </div>
                    ) : (
                      browserTranscript.map((turn) => (
                        <div
                          key={turn.id}
                          className={cn(
                            'rounded-[5px] border px-2.5 py-2',
                            turn.role === 'agent'
                              ? 'border-status-live/25 bg-status-live/5'
                              : 'border-line bg-bg-subtle/60',
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'font-mono text-[10px] uppercase tracking-[0.12em]',
                                turn.role === 'agent' ? 'text-status-live' : 'text-fg-muted',
                              )}
                            >
                              {turn.role === 'agent' ? 'Agent' : 'Caller'}
                            </span>
                            <span className="text-fg-faint font-mono text-[10px]">
                              {formatTranscriptTime(turn.at)}
                              {!turn.final ? ' live' : ''}
                            </span>
                          </div>
                          <p
                            className={cn(
                              'text-[12.5px] leading-relaxed',
                              turn.final ? 'text-fg' : 'text-fg-muted italic',
                            )}
                          >
                            {turn.text}
                          </p>
                        </div>
                      ))
                    )}
                    <div ref={browserTranscriptEndRef} />
                  </div>
                </div>
              )}
            </div>
          )}

          {testPanel === 'llm' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-4">
              <div className="flex items-center gap-2">
                <span className="border-line bg-bg shadow-card grid size-9 place-items-center rounded-full border">
                  <Icon name="cpu" size="sm" className="text-fg-muted" />
                </span>
                <span className="min-w-0">
                  <span className="text-fg block text-[12.5px] font-medium">LLM chat test</span>
                  <span className="text-fg-muted block truncate text-[10.5px]">
                    {modelShortLabel}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={clearLlmChat}
                  disabled={llmTesting || (!llmMessages.length && !llmInput)}
                  className="border-line text-fg-muted hover:bg-bg-muted ml-auto grid size-7 place-items-center rounded-[5px] border transition disabled:opacity-40"
                  aria-label="Clear LLM chat"
                >
                  <Icon name="x" size="xs" />
                </button>
              </div>

              <div className="border-line bg-bg min-h-0 flex-1 overflow-auto rounded-[5px] border p-2">
                {llmMessages.length ? (
                  <div className="space-y-2">
                    {llmMessages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}-${message.text.slice(0, 8)}`}
                        className={cn(
                          'flex',
                          message.role === 'caller' ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[88%] rounded-[6px] px-2.5 py-2 text-[12px] leading-relaxed',
                            message.role === 'caller'
                              ? 'bg-fg text-bg'
                              : 'border-line bg-[#F5F5F7] text-fg border',
                          )}
                        >
                          <p className="whitespace-pre-wrap">{message.text}</p>
                        </div>
                      </div>
                    ))}
                    {llmTesting && (
                      <div className="flex justify-start">
                        <div className="border-line bg-[#F5F5F7] text-fg-muted rounded-[6px] border px-2.5 py-2 text-[12px]">
                          Thinking...
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-fg-muted text-[11px] leading-snug">
                    Start with a caller message.
                  </p>
                )}
              </div>

              {llmResult && (
                <div className="text-fg-muted flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="truncate">{llmResult.model}</span>
                  <span>{llmResult.latencyMs}ms</span>
                </div>
              )}
              {llmResult && !llmResult.aiPowered && (
                <p className="text-status-warn text-[11px]">Gemini key is not configured.</p>
              )}

              <div className="space-y-2">
                <p className="text-fg-muted text-[11px] font-medium">Caller message</p>
                <Textarea
                  rows={3}
                  value={llmInput}
                  onChange={(e) => setLlmInput(e.target.value)}
                  placeholder="Type the next caller message..."
                  className="text-[12px] leading-snug"
                />
                <button
                  type="button"
                  onClick={() => void runLlmTest()}
                  disabled={llmTesting || !llmInput.trim()}
                  className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[5px] border px-2 text-[12.5px] font-medium transition disabled:opacity-50"
                >
                  <PlayIcon /> {llmTesting ? 'Sending' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {testPanel === 'json' && (
            <div className="min-h-0 flex-1 overflow-auto px-3 py-4">
              <pre className="border-line bg-bg text-fg-muted min-h-full overflow-auto rounded-[5px] border p-3 font-mono text-[10.5px] leading-relaxed">
                {JSON.stringify(
                  {
                    name,
                    tier,
                    model,
                    language,
                    voice: { provider: voiceProvider, voiceId, style: voiceStyle },
                    prompt: { system: systemPrompt, firstMessage, guardrails },
                    runtimeSettings,
                    outcomeConfig,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          )}
        </aside>
      </div>

      {/* AI builder dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-2xl">
          <BanglaAgentBuilder
            initial={{ businessName: initial.name, agentName: name }}
            onSkip={() => setBuilderOpen(false)}
            onApply={(prompt) => {
              if (prompt.name) setName(prompt.name)
              if (prompt.description) setDescription(prompt.description)
              if (prompt.language) setLanguage(prompt.language)
              setSystemPrompt(prompt.system)
              setFirstMessage(prompt.firstMessage)
              setGuardrails(prompt.guardrails)
              if (prompt.outcomeConfig) {
                const generatedOutcomes = normalizeOutcomeConfig(prompt.outcomeConfig)
                setOutcomeEnabled(generatedOutcomes.enabled)
                setOutcomeLabels(generatedOutcomes.labels)
              }
              setBuilderOpen(false)
              toast('Bangla prompt and revenue outcomes generated. Save changes to publish it.', 'success')
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Test call dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place a test call</DialogTitle>
            <p className="text-fg-muted text-[12.5px]">
              We&rsquo;ll originate a real call to the number you provide. Make sure the destination
              is expecting the call.
            </p>
          </DialogHeader>
          <div>
            <Label>Destination (E.164)</Label>
            <Input
              className="mt-2"
              placeholder="+8801711000000"
              value={toE164}
              onChange={(e) => setToE164(e.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" onClick={runTestCall} disabled={pending || !toE164}>
              Place call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------------------------- helpers --------------------------------- */

const DEFAULT_PROMPT = `## Identity
You are Mark from the appointment department at Retell Health calling Cindy over the phone to prepare for the annual checkup coming up. Be friendly, professional, and care deeply for the user. You don't provide medical advice but would use the medical knowledge over user responses.

## Style Guardrails
Be Concise: Respond succinctly, addressing one topic at most.
Embrace Variety: Use diverse language and rephrasing to enhance clarity without repeating content.
Be Conversational: Use everyday language, making the chat feel like talking to a friend.
Be Proactive: Lead the conversation, often wrapping up with a question or next-step suggestion.
Avoid multiple questions in a single response.
Get clarity: If the user only partially answers a question, or if the answer is unclear, keep asking for clarity.
Use a colloquial way of referring to the date (like Friday, January 14th, or Tuesday, January 12th, 2024 at 8am).

## Response Guideline
Adapt and Guess: Try to understand transcripts that may contain transcription errors. Avoid mentioning "transcription error" in the response.
Stay in Character: Keep conversations within your role's scope, guiding them back creatively without breaking character.
Ensure Fluid Dialogue: Respond in a role-appropriate, manner maintain a smooth conversation flow.

## Task
You will follow the steps below, do not skip steps, and only ask one question in response.
If at any time the user showed anger or wanted a human agent, call transfer_call to transfer to a human representative.
1. Begin with a self-introduction and verify if caller is Cindy.
   - If caller is not Cindy, call end_call to hang up, say sorry for the confusion when hanging up.
   - If Cindy is not available, call end_call politely to hang up, say you will call back later when hanging up.
2. Inform Cindy she has an annual body check coming up on April 4th, 2024 at 10am PDT. Check if Cindy is available.
   - If not, tell Cindy to reschedule online and jump to step 5.
3. Ask Cindy if there's anything that the doctor should know before the annual checkup.
   - Ask followup questions as needed to assess the severity of the issue, and understand how it affects her changes in health condition.
4. Tell Cindy to not eat or drink that day before the checkup. Also tell Cindy to plan for use a callback if there's any changes in health condition.
   - If user asks something you do not know, let them know you don't have the answer. Ask them if they have any other questions.
5. Ask Cindy if she has any questions, and if so, answer them until there are no questions.
   - If user asks something you do not know, let them know you don't have the answer. Ask them if they have any other questions.
   - If user do not have any questions, call end_call function and say goodbye.`

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7Z" />
    </svg>
  )
}

function IconBtn({
  name,
  label,
  onClick,
}: {
  name: IconName
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-fg-muted hover:bg-bg-muted hover:text-fg grid size-7 place-items-center rounded-[5px] transition"
    >
      <Icon name={name} size="xs" />
    </button>
  )
}

function SegTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center rounded-[4px] px-3 text-[12px] font-medium transition',
        active
          ? 'border border-[#D2D4D6] bg-[#F5F5F7] text-fg'
          : 'text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="text-fg-faint">·</span>
}

function Meta({ label, value, icon }: { label?: string; value: string; icon?: IconName }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {icon && <Icon name={icon} size="xs" />}
      {label && <span className="text-fg-faint">{label}:</span>}
      <span className="text-fg">{value}</span>
    </span>
  )
}

function ToolSelect({
  name,
  label,
  tag,
  avatar,
  options,
  value,
  onChange,
}: {
  name: IconName
  label: string
  tag?: string
  avatar?: boolean
  options: { k: string; label: string; sub?: string; badge?: string }[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-7 items-center gap-1.5 rounded-[5px] border px-2 text-[12px] transition"
      >
        {avatar ? (
          <span className="bg-status-attn-soft text-status-attn grid size-4 place-items-center rounded-full text-[9px] font-semibold">
            {label.charAt(0)}
          </span>
        ) : (
          <Icon name={name} size="xs" />
        )}
        <span className="font-medium">{label}</span>
        {tag && (
          <span className="bg-bg-muted text-fg-muted rounded-sm px-1 text-[9.5px] font-medium uppercase tracking-[0.06em]">
            {tag}
          </span>
        )}
        <Icon name="chevron-down" size="xs" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="border-line bg-bg shadow-pop absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border">
            {options.map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => {
                  onChange(o.k)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] transition',
                  o.k === value ? 'bg-bg-subtle' : 'hover:bg-bg-subtle',
                )}
              >
                <span className="min-w-0">
                  <span className="text-fg block truncate">{o.label}</span>
                  {o.sub && (
                    <span className="text-fg-muted block truncate text-[10.5px]">{o.sub}</span>
                  )}
                </span>
                {o.badge && (
                  <span className="bg-bg-muted text-fg-muted rounded-sm px-1 text-[9.5px] font-medium uppercase tracking-[0.06em]">
                    {o.badge}
                  </span>
                )}
                {o.k === value && <Icon name="check" size="xs" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FooterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { k: string; label: string }[]
}) {
  const def = options.find((o) => o.k === value) ?? options[0]
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-line bg-bg text-fg hover:bg-bg-muted inline-flex h-8 items-center gap-1.5 rounded-[5px] border px-2.5 text-[12px] transition"
      >
        <span>{def.label}</span>
        <Icon name="chevron-down" size="xs" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="border-line bg-bg shadow-pop absolute bottom-full left-0 z-20 mb-1 w-48 overflow-hidden rounded-md border">
            {options.map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => {
                  onChange(o.k)
                  setOpen(false)
                }}
                className="text-fg hover:bg-bg-subtle flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] transition"
              >
                {o.label}
                {o.k === value && <Icon name="check" size="xs" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Accordion({
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  label: string
  icon: IconName
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-line border-b">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-bg-subtle/80 flex w-full items-center gap-2 px-4 py-2.5 text-left transition"
      >
        <Icon name={icon} size="xs" className="text-fg-muted" />
        <span className="text-fg flex-1 text-[12.5px] font-medium">{label}</span>
        <Icon
          name="chevron-down"
          size="xs"
          className={cn('text-fg-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="space-y-3 px-4 pb-4 pt-1">{children}</div>}
    </div>
  )
}

function SubLabel({ title, hint, link }: { title: string; hint?: string; link?: string }) {
  return (
    <div>
      <p className="text-fg text-[12px] font-medium">
        {title}
        {link && (
          <span className="text-fg-muted hover:text-fg ml-1 cursor-pointer underline-offset-2 hover:underline">
            ({link})
          </span>
        )}
      </p>
      {hint && <p className="text-fg-muted mt-0.5 text-[11px]">{hint}</p>}
    </div>
  )
}

function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { k: string; label: string; sub?: string }[]
}) {
  return (
    <div className="space-y-1.5">
      {options.map((o) => {
        const active = o.k === value
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange(o.k)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span
              className={cn(
                'grid size-3.5 shrink-0 place-items-center rounded-full border transition',
                active ? 'border-fg' : 'border-line',
              )}
            >
              {active && <span className="bg-fg size-1.5 rounded-full" />}
            </span>
            <span className="text-fg text-[12px]">
              {o.label}
              {o.sub && <span className="text-fg-muted ml-1 text-[11px]">{o.sub}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
  inset,
}: {
  title: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  inset?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3',
        inset && 'border-line border-t pt-3 first:border-t-0 first:pt-0',
      )}
    >
      <div className="min-w-0">
        <p className="text-fg text-[12px] font-medium">{title}</p>
        {hint && <p className="text-fg-muted mt-0.5 text-[11px]">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={cn(
          'mt-0.5 grid h-4 w-7 shrink-0 place-items-start rounded-full p-0.5 transition-colors',
          checked ? 'bg-fg' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'bg-bg block size-3 rounded-full transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}

function SliderRow({
  title,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  format,
}: {
  title: string
  hint?: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix: string
  format?: (v: number) => string
}) {
  const display = format ? format(value) : value.toString()
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-fg text-[12px] font-medium">{title}</p>
        <span className="text-fg font-mono text-[11.5px] tabular-nums">
          {display} {suffix}
        </span>
      </div>
      {hint && <p className="text-fg-muted mt-0.5 text-[11px]">{hint}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-fg mt-2 w-full"
      />
    </div>
  )
}

function TestTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex flex-col items-center gap-0.5 rounded-[5px] border px-1.5 py-2 text-[10.5px] font-medium transition',
        active
          ? 'border-fg/40 bg-bg text-fg shadow-card'
          : 'text-fg-muted hover:bg-bg hover:text-fg border-transparent',
      )}
    >
      <Icon name={icon} size="xs" />
      <span className="leading-tight">{label}</span>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-fg-muted mb-1 text-[11px] font-medium">{label}</p>
      {children}
    </div>
  )
}

function Divider() {
  return <div className="bg-line my-3 h-px" />
}

function closeBrowserAudioSession(session: BrowserAudioSession | null, closeSocket = true) {
  if (!session) return
  if (session.pipecat) {
    void session.pipecat.disconnect().catch(() => {})
  }
  try {
    session.processor?.disconnect()
  } catch {}
  try {
    session.source?.disconnect()
  } catch {}
  for (const track of session.stream?.getTracks() ?? []) {
    track.stop()
  }
  for (const track of session.remoteStream?.getTracks() ?? []) {
    track.stop()
  }
  if (session.remoteAudio) {
    session.remoteAudio.pause()
    session.remoteAudio.srcObject = null
    session.remoteAudio.remove()
  }
  if (
    closeSocket &&
    session.socket &&
    (session.socket.readyState === WebSocket.OPEN ||
      session.socket.readyState === WebSocket.CONNECTING)
  ) {
    session.socket.close(1000, 'browser test stopped')
  }
  if (session.context && session.context.state !== 'closed') {
    void session.context.close().catch(() => {})
  }
}

async function connectBrowserWebrtcSession(
  session: BrowserWebrtcStartResult,
  audioSession: BrowserAudioSession,
  handlers: {
    onDisconnected: () => void
    onError: () => void
    onTranscript: (turn: LiveTranscriptTurn) => void
  },
) {
  const [{ PipecatClient }, { SmallWebRTCTransport }] = await Promise.all([
    import('@pipecat-ai/client-js'),
    import('@pipecat-ai/small-webrtc-transport'),
  ])
  const iceServers = session.iceServers ?? []
  let botTurnSeq = 0
  let botTurnId = ''
  let botTurnAt = ''
  let botText = ''
  let botFlushTimer: number | undefined

  function clearBotFlushTimer() {
    if (!botFlushTimer) return
    window.clearTimeout(botFlushTimer)
    botFlushTimer = undefined
  }

  function ensureBotTurn() {
    if (botTurnId) return
    botTurnSeq += 1
    botTurnAt = new Date().toISOString()
    botTurnId = `browser-agent-${botTurnSeq}`
    botText = ''
  }

  function emitBotTranscript(final: boolean) {
    const text = botText.trim()
    if (!botTurnId || !text) return
    handlers.onTranscript({
      id: botTurnId,
      role: 'agent',
      text,
      at: botTurnAt,
      final,
    })
    if (final) {
      botTurnId = ''
      botTurnAt = ''
      botText = ''
    }
  }

  function appendBotTranscript(chunk: string) {
    const text = chunk.trim()
    if (!text) return
    ensureBotTurn()
    botText = mergeTranscriptChunk(botText, text)
    const previewText = botText.trim()
    if (/[.!?\u0964]$/u.test(previewText) || previewText.length >= 180) {
      emitBotTranscript(false)
    }
    clearBotFlushTimer()
    botFlushTimer = window.setTimeout(() => {
      emitBotTranscript(true)
      clearBotFlushTimer()
    }, 1200)
  }

  function finalizeBotTranscript() {
    clearBotFlushTimer()
    emitBotTranscript(true)
  }

  const client = new PipecatClient({
    transport: new SmallWebRTCTransport({
      iceServers,
      waitForICEGathering: false,
    }),
    enableMic: true,
    enableCam: false,
    callbacks: {
      onError: () => {
        finalizeBotTranscript()
        handlers.onError()
      },
      onDeviceError: () => {
        finalizeBotTranscript()
        handlers.onError()
      },
      onDisconnected: () => {
        finalizeBotTranscript()
        handlers.onDisconnected()
      },
      onBotDisconnected: () => {
        finalizeBotTranscript()
        handlers.onDisconnected()
      },
      onUserTranscript: (data) => {
        const text = String(data.text || '').trim()
        if (!text) return
        const at = normalizeTranscriptAt(data.timestamp)
        const final = Boolean(data.final)
        handlers.onTranscript({
          id: final ? transcriptTurnId('user', at, text) : USER_INTERIM_TURN_ID,
          role: 'user',
          text,
          at,
          final,
        })
      },
      onBotOutput: (data) => {
        if (!data.spoken) return
        const text = String(data.text || '').trim()
        appendBotTranscript(text)
      },
      onBotStartedSpeaking: () => {
        ensureBotTurn()
      },
      onBotStoppedSpeaking: () => {
        finalizeBotTranscript()
      },
      onTrackStarted: (track) => {
        attachBrowserWebrtcAudioTrack(audioSession, track)
      },
      onTrackStopped: (track) => {
        if (track.kind !== 'audio') return
        audioSession.remoteAudio?.pause()
        audioSession.remoteAudio?.remove()
        audioSession.remoteAudio = undefined
        audioSession.remoteStream = undefined
      },
      onTransportStateChanged: (state) => {
        if (state === 'error') {
          finalizeBotTranscript()
          handlers.onError()
        }
      },
    },
  })
  audioSession.pipecat = client
  await client.initDevices()
  await client.connect({
    webrtcRequestParams: {
      endpoint: session.webrtcUrl,
    },
    iceConfig: {
      iceServers,
    },
  })
}

function attachBrowserWebrtcAudioTrack(session: BrowserAudioSession, track: MediaStreamTrack) {
  if (track.kind !== 'audio') return
  session.remoteAudio?.pause()
  session.remoteAudio?.remove()

  const stream = new MediaStream([track])
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.setAttribute('playsinline', 'true')
  audio.muted = false
  audio.volume = 1
  audio.srcObject = stream
  audio.style.display = 'none'
  document.body.appendChild(audio)

  session.remoteStream = stream
  session.remoteAudio = audio
  void audio.play().catch(() => {
    // The call starts from a user gesture, but mobile browsers can still race
    // the remote track. A later user interaction will unlock the element.
  })
}

function waitForSocketOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Browser test connection timed out'))
    }, 10000)

    function cleanup() {
      window.clearTimeout(timeout)
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('error', handleError)
    }
    function handleOpen() {
      cleanup()
      resolve()
    }
    function handleError() {
      cleanup()
      reject(new Error('Could not connect to the browser test service'))
    }

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('error', handleError)
  })
}

function resampleFloat32(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return new Float32Array(input)
  const ratio = fromRate / toRate
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i * ratio
    const left = Math.floor(sourceIndex)
    const right = Math.min(input.length - 1, left + 1)
    const weight = sourceIndex - left
    output[i] = input[left] * (1 - weight) + input[right] * weight
  }
  return output
}

function floatTo16BitPcm(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]))
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return buffer
}

function playPcmChunk(session: BrowserAudioSession, buffer: ArrayBuffer) {
  if (!session.context || buffer.byteLength < 2) return
  const aligned = buffer.byteLength % 2 === 0 ? buffer : buffer.slice(0, buffer.byteLength - 1)
  const samples = new Int16Array(aligned)
  if (samples.length === 0) return
  const sampleRate = inferPcmSampleRate(aligned.byteLength, session.outputSampleRate)
  const audioBuffer = session.context.createBuffer(1, samples.length, sampleRate)
  const channel = audioBuffer.getChannelData(0)
  for (let i = 0; i < samples.length; i += 1) {
    channel[i] = samples[i] / (samples[i] < 0 ? 0x8000 : 0x7fff)
  }
  const source = session.context.createBufferSource()
  source.buffer = audioBuffer
  source.connect(session.context.destination)
  const startAt = Math.max(session.context.currentTime + 0.02, session.playbackTime)
  source.start(startAt)
  session.playbackTime = startAt + audioBuffer.duration
}

function inferPcmSampleRate(byteLength: number, fallback: number) {
  if (byteLength % 960 === 0 && byteLength % 640 !== 0) return 24000
  if (byteLength % 640 === 0 && byteLength % 960 !== 0) return 16000
  return fallback
}

function parseBrowserTranscriptMessage(message: string): LiveTranscriptTurn | null {
  try {
    const data = JSON.parse(message) as Record<string, unknown>
    const type = String(data.type || data.event || 'transcript')
    if (!['call.transcript', 'transcript', 'transcript.final'].includes(type)) return null
    const role = normalizeTranscriptRole(data.role)
    const text = String(data.text || data.transcript || '').trim()
    if (!role || !text) return null
    const at = normalizeTranscriptAt(typeof data.at === 'string' ? data.at : undefined)
    const final = data.final !== false
    const rawClientTurnId = typeof data.clientTurnId === 'string' ? data.clientTurnId.trim() : ''
    return {
      id: rawClientTurnId || transcriptTurnId(role, at, text),
      role,
      text,
      at,
      final,
    }
  } catch {
    return null
  }
}

function normalizeTranscriptRole(value: unknown): LiveTranscriptRole | null {
  const role = String(value || '').toLowerCase()
  if (role === 'agent' || role === 'assistant' || role === 'bot') return 'agent'
  if (role === 'user' || role === 'caller' || role === 'customer') return 'user'
  return null
}

function normalizeTranscriptAt(value?: string) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function transcriptTurnId(role: LiveTranscriptRole, at: string, text: string) {
  return `browser-${role}-${hashString(`${role}:${at}:${text}`)}`
}

function mergeTranscriptChunk(current: string, chunk: string) {
  const text = chunk.trim()
  const existing = current.trim()
  if (!existing) return text
  if (text.startsWith(existing)) return text
  if (existing.endsWith(text)) return existing
  if (/^[,.;:!?)]/.test(text)) return `${existing}${text}`
  if (/[(]$/.test(existing)) return `${existing}${text}`
  return `${existing} ${text}`
}

function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function formatTranscriptTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatTime(date)
}

function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}
