'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { TopBar } from '@/components/app/top-bar'
import { BanglaAgentBuilder } from '@/components/app/bangla-agent-builder'
import { cn } from '@/lib/cn'
import { defaultLanguageForTier, languageOptionsForTier, type Tier, type AgentLanguage } from '@/types/agent'

type SectionId = 'engine' | 'identity' | 'voice' | 'behavior' | 'tools' | 'compliance'

interface TierDef {
  key: Tier
  badge: string
  title: string
  desc: string
  bullets: string[]
  pricePaisa: number
  icon: IconName
}

interface KbOption {
  id: string
  name: string
  quality?: { score?: number; readySources?: number; chunkCount?: number } | null
}

const tiers: TierDef[] = [
  {
    key: 'gemini_live',
    badge: 'T1',
    title: 'Conversational',
    desc: 'Real-time bidirectional Gemini Live.',
    bullets: ['~120 ms first token', 'Best for sales · escalation', 'Native interruption'],
    pricePaisa: 700,
    icon: 'wave',
  },
  {
    key: 'grok_voice',
    badge: 'Grok',
    title: 'Grok Voice',
    desc: 'xAI real-time Voice Agent API.',
    bullets: ['$0.05/min xAI session', 'Bangla voices', 'Tone selection + barge-in'],
    pricePaisa: 700,
    icon: 'wave',
  },
  {
    key: 'pipeline',
    badge: 'T2',
    title: 'Pipeline',
    desc: 'Deepgram → Gemini 2.5 Flash → Cartesia Sonic-2.',
    bullets: ['~280 ms first token', 'Best for support · ops', 'Bring your own LLM'],
    pricePaisa: 600,
    icon: 'cpu',
  },
  {
    key: 'dtmf',
    badge: 'T3',
    title: 'IVR / DTMF',
    desc: 'Pre-rendered Gemini TTS + keypad branches.',
    bullets: ['Instant response', 'Best for OTP · surveys', 'Pennies per minute'],
    pricePaisa: 200,
    icon: 'hash',
  },
]

interface VoicePreset {
  id: string
  provider: string
  name: string
  accent: string
  gender: 'female' | 'male' | 'neutral'
  style: string
  styles?: string[]
  seed: number[]
}

const voiceLibrary: Record<Tier, VoicePreset[]> = {
  pipeline: [
    { id: 'cartesia:anika-bn', provider: 'cartesia', name: 'Anika', accent: 'Bangla · Dhaka', gender: 'female', style: 'Warm, conversational', seed: [3, 5, 7, 4, 8, 6, 9, 5, 7, 4, 8, 6] },
    { id: 'cartesia:asif-bn', provider: 'cartesia', name: 'Asif', accent: 'Bangla · Dhaka', gender: 'male', style: 'Neutral, professional', seed: [4, 6, 5, 8, 6, 4, 7, 5, 8, 6, 4, 7] },
    { id: 'cartesia:aria-en', provider: 'cartesia', name: 'Aria', accent: 'English · Indian', gender: 'female', style: 'Friendly, helpful', seed: [2, 4, 6, 8, 5, 7, 4, 6, 8, 5, 3, 6] },
    { id: 'cartesia:rohit-en', provider: 'cartesia', name: 'Rohit', accent: 'English · Indian', gender: 'male', style: 'Formal, confident', seed: [5, 3, 7, 5, 8, 6, 4, 7, 5, 3, 8, 6] },
    { id: 'cartesia:maya-us', provider: 'cartesia', name: 'Maya', accent: 'English · US', gender: 'female', style: 'Customer-service tone', seed: [3, 5, 4, 7, 5, 8, 6, 4, 7, 5, 8, 3] },
    { id: 'cartesia:theo-us', provider: 'cartesia', name: 'Theo', accent: 'English · US', gender: 'male', style: 'Neutral, calm', seed: [4, 6, 8, 5, 7, 4, 6, 8, 5, 7, 4, 6] },
  ],
  gemini_live: [
    { id: 'gemini-live:aoede', provider: 'gemini-live', name: 'Aoede', accent: 'Bangla + English', gender: 'female', style: 'Native bilingual', seed: [4, 7, 5, 8, 6, 4, 7, 5, 8, 6, 4, 7] },
    { id: 'gemini-live:charon', provider: 'gemini-live', name: 'Charon', accent: 'Bangla + English', gender: 'male', style: 'Native bilingual', seed: [5, 4, 7, 6, 5, 8, 4, 7, 6, 5, 8, 4] },
    { id: 'gemini-live:kore', provider: 'gemini-live', name: 'Kore', accent: 'English · neutral', gender: 'neutral', style: 'Calm assistant', seed: [3, 5, 7, 5, 6, 4, 7, 5, 6, 4, 7, 3] },
  ],
  grok_voice: [
    { id: 'xai:rohan', provider: 'xai', name: 'Rohan', accent: 'Male · young · Bengali', gender: 'male', style: 'friendly', styles: ['friendly', 'energetic', 'support', 'professional'], seed: [5, 7, 4, 8, 6, 5, 7, 4, 8, 6, 5, 7] },
    { id: 'xai:pooja', provider: 'xai', name: 'Pooja', accent: 'Female · Bengali', gender: 'female', style: 'warm', styles: ['warm', 'friendly', 'conversational', 'support'], seed: [3, 6, 8, 5, 7, 4, 6, 8, 5, 7, 4, 6] },
    { id: 'xai:anika', provider: 'xai', name: 'Anika', accent: 'Female · young · Bengali', gender: 'female', style: 'bright', styles: ['bright', 'helpful', 'energetic', 'conversational'], seed: [4, 7, 6, 8, 5, 7, 6, 8, 5, 7, 4, 6] },
    { id: 'xai:tanvir', provider: 'xai', name: 'Tanvir', accent: 'Male · Bengali', gender: 'male', style: 'calm', styles: ['calm', 'professional', 'confident', 'instructional'], seed: [6, 4, 7, 5, 8, 6, 4, 7, 5, 8, 6, 4] },
  ],
  dtmf: [
    { id: 'dtmf:news-bn', provider: 'gemini-tts', name: 'News-anchor', accent: 'Bangla', gender: 'female', style: 'Crisp, articulate', seed: [2, 5, 3, 6, 4, 7, 3, 6, 4, 7, 3, 5] },
    { id: 'dtmf:operator-bn', provider: 'gemini-tts', name: 'Operator', accent: 'Bangla', gender: 'male', style: 'IVR-style', seed: [3, 4, 6, 5, 7, 4, 6, 5, 7, 4, 6, 3] },
  ],
}

const sectionMeta: { id: SectionId; title: string; eyebrow: string; description: string }[] = [
  { id: 'engine', title: 'Engine', eyebrow: '01', description: 'Pick the engine that matches the conversation. You can swap tiers later without rewriting the prompt.' },
  { id: 'identity', title: 'Identity', eyebrow: '02', description: 'A short human name helps your team distinguish agents. Description is internal only.' },
  { id: 'voice', title: 'Language & voice', eyebrow: '03', description: 'Bangla, English, or both — every voice is tuned for Bangladeshi callers.' },
  { id: 'behavior', title: 'Behavior', eyebrow: '04', description: "The system prompt is the agent's job description. The first message is what callers actually hear." },
  { id: 'tools', title: 'Knowledge & tools', eyebrow: '05', description: 'Connect a knowledge base for retrieval, or hook a webhook to record outcomes in your CRM.' },
  { id: 'compliance', title: 'Compliance', eyebrow: '06', description: "Bangladesh-specific defaults are on. We don't recommend turning these off without legal review." },
]

type KnowledgeMode = 'none' | 'selected' | 'later'

export function NewAgentForm({ kbs = [] }: { kbs?: KbOption[] }) {
  const router = useRouter()
  const [tier, setTier] = useState<Tier>('pipeline')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState<AgentLanguage>('bn-en-mixed')
  const [voiceId, setVoiceId] = useState<string>(voiceLibrary.pipeline[0].id)
  const [voiceTone, setVoiceTone] = useState<string>(voiceLibrary.pipeline[0].style)
  const [systemPrompt, setSystemPrompt] = useState(
    "You are Anika, a helpful assistant for [Business]. Speak in the caller's preferred language between Bangla and English. Always introduce yourself, confirm the caller's intent, and let them know this call may be recorded for quality.",
  )
  const [firstMessage, setFirstMessage] = useState(
    'আসসালামু আলাইকুম, আমি [Business]-এর সহকারী আনিকা। আজ আমি কীভাবে সাহায্য করতে পারি?',
  )
  const [guardrails, setGuardrails] = useState(
    'Never make commitments about delivery times you cannot verify. Never collect bKash PIN, OTP, or full card numbers. If unsure, escalate to a human at +880-1700-000000.',
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [postCallWebhook, setPostCallWebhook] = useState('')
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>('none')
  const [selectedKbs, setSelectedKbs] = useState<string[]>([])
  const [recordingDisclosure, setRecordingDisclosure] = useState(true)
  const [optOutKeywords, setOptOutKeywords] = useState(true)
  const [dncCheck, setDncCheck] = useState(true)
  const [autoBilingualHandoff, setAutoBilingualHandoff] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionId>('engine')
  const [showPreview, setShowPreview] = useState(true)
  const [showBuilder, setShowBuilder] = useState(true)

  useEffect(() => {
    const lib = voiceLibrary[tier]
    const current = lib.find((v) => v.id === voiceId)
    if (!current) {
      setVoiceId(lib[0].id)
      setVoiceTone(lib[0].style)
      return
    }
    if (!((current.styles ?? [current.style]).includes(voiceTone))) {
      setVoiceTone(current.style)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, voiceId])

  useEffect(() => {
    const languages = languageOptionsForTier(tier)
    if (!languages.some((l) => l.k === language)) {
      setLanguage(defaultLanguageForTier(tier))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, language])

  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    engine: null,
    identity: null,
    voice: null,
    behavior: null,
    tools: null,
    compliance: null,
  })

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) {
          const id = visible.target.getAttribute('data-section') as SectionId | null
          if (id) setActiveSection(id)
        }
      },
      { rootMargin: '-25% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    )
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const tierDef = useMemo(() => tiers.find((t) => t.key === tier)!, [tier])
  const selectedVoice = voiceLibrary[tier].find((v) => v.id === voiceId) ?? voiceLibrary[tier][0]
  const knowledgeOptions = useMemo(() => {
    const options: { v: KnowledgeMode; title: string; body: string }[] = [
      { v: 'none', title: 'No retrieval', body: 'Pure prompt. Best for simple flows.' },
    ]
    if (kbs.length) {
      options.push({
        v: 'selected',
        title: 'Attach knowledge',
        body: `Use ${kbs.length} existing knowledge base${kbs.length === 1 ? '' : 's'} from the first call.`,
      })
    }
    options.push({
      v: 'later',
      title: 'Connect later',
      body: 'Upload PDFs/URLs from the Knowledge tab after creating.',
    })
    return options
  }, [kbs.length])

  function scrollToSection(id: SectionId) {
    const el = sectionRefs.current[id]
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 132
    window.scrollTo({ top, behavior: 'smooth' })
  }

  function toggleKb(id: string) {
    setSelectedKbs((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    if (knowledgeMode === 'selected' && selectedKbs.length === 0) {
      setSaving(false)
      setError('Choose at least one knowledge base or switch to no retrieval.')
      return
    }
    const guardrailsPayload = [
      guardrails,
      recordingDisclosure ? '[btrc:recording-disclosure=on]' : '',
      optOutKeywords ? '[btrc:opt-out=on]' : '',
      dncCheck ? '[btrc:dnc=on]' : '',
      autoBilingualHandoff ? '[bilingual-handoff=on]' : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name || `${tierDef.title} agent`,
        description,
        tier,
        model: tier === 'grok_voice' ? 'grok-voice-think-fast-1.0' : '',
        language,
        voice: { provider: selectedVoice.provider, voiceId: selectedVoice.id, style: voiceTone },
        prompt: { system: systemPrompt, firstMessage, guardrails: guardrailsPayload },
        knowledgeBaseIds: knowledgeMode === 'selected' ? selectedKbs : [],
        postCallWebhook,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Could not create agent')
      return
    }
    const j = await res.json()
    router.push(`/agents/${j.id}`)
    router.refresh()
  }

  const wordCount = systemPrompt.trim().split(/\s+/).filter(Boolean).length
  const promptHealth =
    wordCount === 0 ? 'empty' : wordCount < 20 ? 'thin' : wordCount > 600 ? 'long' : 'good'

  return (
    <>
      <TopBar
        title={name || 'New agent'}
        searchPlaceholder="Search prompts, tools..."
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className={cn(
                'hidden h-8 items-center gap-1.5 rounded-[5px] border px-3 text-[12.5px] font-medium transition xl:inline-flex',
                showPreview
                  ? 'border-fg bg-fg text-fg-inverse'
                  : 'border-line bg-bg text-fg hover:bg-bg-muted',
              )}
            >
              <Icon name="speaker" size="xs" /> Preview
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-agent-form"
              disabled={saving}
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-fg px-3 text-[12.5px] font-medium text-fg-inverse transition hover:bg-fg-strong disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create agent'}
              <Icon name="arrow-right" size="xs" />
            </button>
          </>
        }
      />

      <form
        id="new-agent-form"
        onSubmit={onSubmit}
        className="flex-1 overflow-y-auto bg-bg-subtle/40"
      >
        <div className="border-b border-line/70 bg-bg px-6 py-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
            Agents · Draft
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">
            {name || 'Untitled agent'}
            <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
              · draft
            </span>
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Configure the engine, voice, prompts, and compliance for this agent. You can revise everything later.
          </p>
        </div>

        <div className="sticky top-0 z-10 border-b border-line bg-bg/90 px-6 backdrop-blur">
          <nav className="-mb-px flex items-center gap-1.5 overflow-x-auto">
            {sectionMeta.map((s) => {
              const active = activeSection === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2 pb-2.5 pt-2.5 text-[12.5px] transition',
                    active
                      ? 'border-fg text-fg'
                      : 'border-transparent text-fg-muted hover:text-fg',
                  )}
                >
                  <span className="font-mono text-[10px] tabular-nums tracking-[0.08em] text-fg-faint">
                    {s.eyebrow}
                  </span>
                  <span className={cn(active && 'font-medium')}>{s.title}</span>
                </button>
              )
            })}
          </nav>
        </div>

      <div
        className={cn(
          'mx-auto grid max-w-screen-xl grid-cols-1 gap-6 px-6 py-8',
          showPreview ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : '',
        )}
      >
        <div className="min-w-0 space-y-6">
          {showBuilder ? (
            <BanglaAgentBuilder
              onSkip={() => setShowBuilder(false)}
              onApply={(prompt) => {
                setName((current) => current || prompt.name)
                setDescription((current) => current || prompt.description)
                setLanguage(prompt.language)
                setSystemPrompt(prompt.system)
                setFirstMessage(prompt.firstMessage)
                setGuardrails(prompt.guardrails)
                setShowAdvanced(true)
                setShowBuilder(false)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowBuilder(true)}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 py-1.5 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted"
            >
              <Icon name="sparkles" size="xs" /> Open Bangla AI Agent Builder
            </button>
          )}

          {/* Engine */}
          <Section id="engine" eyebrow="01 · Engine" title="How it thinks" description={sectionMeta[0].description} refs={sectionRefs}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {tiers.map((t) => {
                const active = tier === t.key
                return (
                  <button
                    type="button"
                    key={t.key}
                    onClick={() => setTier(t.key)}
                    aria-pressed={active}
                    className={cn(
                      'flex flex-col rounded-lg border p-4 text-left transition',
                      active
                        ? 'border-fg bg-bg shadow-card-hover'
                        : 'border-line bg-bg hover:border-fg/30',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">
                        {t.badge}
                      </span>
                      {active ? (
                        <span className="grid size-4 place-items-center rounded-full bg-fg text-fg-inverse">
                          <Icon name="check" size="xs" square={false} className="text-fg-inverse" />
                        </span>
                      ) : (
                        <span className="grid size-4 place-items-center rounded-full border border-line" />
                      )}
                    </div>
                    <p className="mt-3 font-display text-[15px] font-medium tracking-tighter text-fg">
                      {t.title}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-snug text-fg-muted">{t.desc}</p>
                    <ul className="mt-3 space-y-1 text-[11.5px] text-fg-muted">
                      {t.bullets.map((b) => (
                        <li key={b} className="flex items-center gap-1.5">
                          <span className="size-1 rounded-full bg-fg-faint" />
                          {b}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                        From
                      </span>
                      <span className="font-display text-[14px] font-medium tracking-tighter text-fg">
                        ৳{(t.pricePaisa / 100).toFixed(2)}
                        <span className="ml-0.5 text-[11px] text-fg-muted">/min</span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Identity */}
          <Section id="identity" eyebrow="02 · Identity" title="Name your agent" description={sectionMeta[1].description} refs={sectionRefs}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Agent name" htmlFor="name" hint="Shown to your team in the dashboard.">
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Order-status agent"
                />
              </Field>
              <Field label="Description" htmlFor="description" hint="Internal — never spoken on a call.">
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Inbound order-status calls in BN/EN."
                />
              </Field>
            </div>
          </Section>

          {/* Voice */}
          <Section id="voice" eyebrow="03 · Language & voice" title="Pick how it sounds" description={sectionMeta[2].description} refs={sectionRefs}>
            <div className="space-y-5">
              <Field label="Language">
                <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-line bg-bg p-1.5">
                  {languageOptionsForTier(tier).map((o) => {
                    const active = language === o.k
                    return (
                      <button
                        key={o.k}
                        type="button"
                        onClick={() => setLanguage(o.k)}
                        className={cn(
                          'rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition',
                          active ? 'bg-fg text-fg-inverse' : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <Field
                label="Voice"
                hint={`${voiceLibrary[tier].length} available · ${tierDef.title.toLowerCase()} · provider: ${selectedVoice.provider}`}
              >
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {voiceLibrary[tier].map((v) => {
                    const active = v.id === voiceId
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setVoiceId(v.id)
                          setVoiceTone(v.style)
                        }}
                        aria-pressed={active}
                        className={cn(
                          'flex items-center gap-3 rounded-md border p-3 text-left transition',
                          active
                            ? 'border-fg bg-bg shadow-card-hover'
                            : 'border-line bg-bg hover:border-fg/30',
                        )}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fg text-fg-inverse text-[12px] font-semibold">
                          {v.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-display text-[13.5px] font-medium tracking-tighter text-fg">
                              {v.name}
                            </span>
                            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-faint">
                              {v.gender === 'female' ? '♀' : v.gender === 'male' ? '♂' : '·'}
                            </span>
                          </span>
                          <span className="block truncate text-[11.5px] text-fg-muted">
                            {v.accent}
                          </span>
                        </span>
                        {active && (
                          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-fg text-fg-inverse">
                            <Icon name="check" size="xs" square={false} className="text-fg-inverse" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field label={tier === 'grok_voice' ? 'Tone' : 'Voice style'}>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedVoice.styles ?? [selectedVoice.style]).map((tone) => {
                    const active = voiceTone === tone
                    return (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setVoiceTone(tone)}
                        className={cn(
                          'rounded-[5px] border px-3 py-1.5 text-[12.5px] font-medium capitalize transition',
                          active
                            ? 'border-fg bg-fg text-fg-inverse'
                            : 'border-line text-fg-muted hover:border-fg/30 hover:text-fg',
                        )}
                      >
                        {tone}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </div>
          </Section>

          {/* Behavior */}
          <Section id="behavior" eyebrow="04 · Behavior" title="Tell it how to act" description={sectionMeta[3].description} refs={sectionRefs}>
            <div className="space-y-4">
              <Field
                label="First message"
                htmlFor="firstMessage"
                hint="The agent says this exactly when the call connects."
              >
                <Textarea
                  id="firstMessage"
                  className="min-h-[88px] font-bangla"
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                />
                <FieldFooter>
                  <span>{firstMessage.length} chars</span>
                  <span>≈ {Math.max(1, Math.round((firstMessage.length / 14) * 0.6))}s spoken</span>
                </FieldFooter>
              </Field>

              <Field
                label="System prompt"
                htmlFor="systemPrompt"
                hint="Personality, scope, escalation rules. Use [Business] as a placeholder — substituted at run time."
              >
                <Textarea
                  id="systemPrompt"
                  className="min-h-[200px]"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                />
                <FieldFooter>
                  <span className={cn(promptHealth === 'good' ? 'text-fg-muted' : 'text-status-warn')}>
                    {wordCount} words · {promptHealth}
                  </span>
                  <span>{systemPrompt.length} chars</span>
                </FieldFooter>
              </Field>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-muted transition hover:text-fg"
              >
                <Icon
                  name="chevron-right"
                  size="xs"
                  square={false}
                  className={cn('transition-transform', showAdvanced && 'rotate-90')}
                />
                {showAdvanced ? 'Hide guardrails' : 'Add guardrails (optional)'}
              </button>

              {showAdvanced && (
                <Field
                  label="Guardrails"
                  htmlFor="guardrails"
                  hint="Hard rules the agent must never break. Listed verbatim with high priority."
                >
                  <Textarea
                    id="guardrails"
                    className="min-h-[120px]"
                    value={guardrails}
                    onChange={(e) => setGuardrails(e.target.value)}
                  />
                </Field>
              )}
            </div>
          </Section>

          {/* Tools */}
          <Section id="tools" eyebrow="05 · Knowledge & tools" title="Give it context" description={sectionMeta[4].description} refs={sectionRefs}>
            <div className="space-y-5">
              <Field label="Knowledge base">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {knowledgeOptions.map((o) => {
                    const active = knowledgeMode === o.v
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setKnowledgeMode(o.v)}
                        aria-pressed={active}
                        className={cn(
                          'flex flex-col items-start rounded-md border p-3.5 text-left transition',
                          active ? 'border-fg bg-bg shadow-card-hover' : 'border-line bg-bg hover:border-fg/30',
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="font-display text-[13.5px] font-medium tracking-tighter text-fg">
                            {o.title}
                          </span>
                          {active && (
                            <span className="grid size-4 place-items-center rounded-full bg-fg text-fg-inverse">
                              <Icon name="check" size="xs" square={false} className="text-fg-inverse" />
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-fg-muted">{o.body}</p>
                      </button>
                    )
                  })}
                </div>
                {knowledgeMode === 'selected' && (
                  <div className="mt-3 rounded-md border border-line bg-bg p-2">
                    <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                      {kbs.map((kb) => {
                        const active = selectedKbs.includes(kb.id)
                        const readySources = kb.quality?.readySources ?? 0
                        const chunkCount = kb.quality?.chunkCount ?? 0
                        return (
                          <button
                            key={kb.id}
                            type="button"
                            onClick={() => toggleKb(kb.id)}
                            aria-pressed={active}
                            className={cn(
                              'flex items-start justify-between gap-3 rounded border p-3 text-left transition',
                              active
                                ? 'border-fg bg-bg-subtle'
                                : 'border-line bg-bg hover:border-fg/30',
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-fg">
                                {kb.name}
                              </span>
                              <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                                {readySources} ready sources · {chunkCount} chunks
                              </span>
                            </span>
                            <span
                              className={cn(
                                'grid size-4 shrink-0 place-items-center rounded-full border',
                                active
                                  ? 'border-fg bg-fg text-fg-inverse'
                                  : 'border-line text-transparent',
                              )}
                            >
                              <Icon name="check" size="xs" square={false} className="text-current" />
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </Field>

              <Field
                label="Post-call webhook"
                htmlFor="postCallWebhook"
                hint="We POST a transcript + outcome here when the call ends. Optional."
              >
                <Input
                  id="postCallWebhook"
                  value={postCallWebhook}
                  onChange={(e) => setPostCallWebhook(e.target.value)}
                  placeholder="https://your-crm.example.com/webhooks/livocall"
                  type="url"
                />
              </Field>

              <ToggleRow
                title="Auto bilingual hand-off"
                body="If the caller switches between Bangla and English mid-sentence, the agent matches their language."
                checked={autoBilingualHandoff}
                onChange={setAutoBilingualHandoff}
              />
            </div>
          </Section>

          {/* Compliance */}
          <Section id="compliance" eyebrow="06 · Compliance" title="BTRC & callers' rights" description={sectionMeta[5].description} refs={sectionRefs}>
            <div className="overflow-hidden rounded-md border border-line bg-bg">
              <ToggleRow
                inset
                title="Recording disclosure"
                body="The agent announces 'this call may be recorded for quality' on the first turn."
                badge="BTRC"
                checked={recordingDisclosure}
                onChange={setRecordingDisclosure}
              />
              <ToggleRow
                inset
                title="Opt-out keywords"
                body="If the caller says any of: stop, no thanks, do not call, করবেন না — agent confirms and adds them to your DNC list."
                badge="BTRC"
                checked={optOutKeywords}
                onChange={setOptOutKeywords}
              />
              <ToggleRow
                inset
                title="Check DNC list before outbound"
                body="Before any outbound dial, the platform verifies the number isn't on your org's Do-Not-Call list."
                badge="BTRC"
                checked={dncCheck}
                onChange={setDncCheck}
              />
            </div>

            {error && (
              <div className="mt-5 flex items-start gap-2 rounded-md border border-status-fail/30 bg-status-fail-soft px-3 py-2 text-[12.5px] text-status-fail">
                <Icon name="x" size="sm" square={false} className="mt-0.5 text-status-fail" />
                {error}
              </div>
            )}
          </Section>

          {/* Sticky bottom save */}
          <div className="flex items-center justify-between rounded-md border border-line bg-bg p-3">
            <div className="text-[12px] text-fg-muted">
              <span className="font-display text-[14px] font-medium tracking-tighter text-fg">
                Estimated cost
              </span>
              <span className="ml-2 font-mono text-fg-faint">
                ৳{(tierDef.pricePaisa / 100).toFixed(2)}/min · {tierDef.title} · +15% VAT
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
                {saving ? 'Creating…' : 'Create & deploy'}
                <Icon name="arrow-right" size="xs" square={false} />
              </Button>
            </div>
          </div>
        </div>

        {/* Preview rail */}
        {showPreview && (
          <aside className="hidden xl:block">
            <div className="sticky top-[132px] space-y-4">
              <PreviewCard
                tierDef={tierDef}
                voice={selectedVoice}
                language={language}
                firstMessage={firstMessage}
                name={name}
                latency={tierDef.key === 'grok_voice' ? 'sub-second' : '~120 ms'}
              />

              <div className="rounded-lg border border-line bg-bg p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                  Compliance
                </p>
                <ul className="mt-2 space-y-1.5 text-[12px]">
                  <ComplianceRow on={recordingDisclosure}>Recording disclosure</ComplianceRow>
                  <ComplianceRow on={optOutKeywords}>Opt-out keywords</ComplianceRow>
                  <ComplianceRow on={dncCheck}>DNC pre-check</ComplianceRow>
                  <ComplianceRow on={autoBilingualHandoff}>Bilingual hand-off</ComplianceRow>
                </ul>
              </div>

              <p className="px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
                Voice node · Singapore · ~80 ms RTT
              </p>
            </div>
          </aside>
        )}
      </div>
      </form>
    </>
  )
}

/* --------------------------------- helpers -------------------------------- */

function Section({
  id,
  eyebrow,
  title,
  description,
  refs,
  children,
}: {
  id: SectionId
  eyebrow: string
  title: string
  description: string
  refs: React.MutableRefObject<Record<SectionId, HTMLElement | null>>
  children: React.ReactNode
}) {
  return (
    <section
      ref={(el) => {
        refs.current[id] = el
      }}
      data-section={id}
      id={id}
      className="rounded-lg border border-line bg-bg p-6 md:p-7"
    >
      <header className="mb-5 border-b border-line pb-4">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 font-display text-[20px] font-medium tracking-tightest text-fg">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fg-muted">{description}</p>
      </header>
      {children}
    </section>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-muted"
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-[11.5px] leading-snug text-fg-faint">{hint}</p>}
    </div>
  )
}

function FieldFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">
      {children}
    </div>
  )
}

function ToggleRow({
  title,
  body,
  badge,
  checked,
  onChange,
  inset,
}: {
  title: string
  body: string
  badge?: string
  checked: boolean
  onChange: (v: boolean) => void
  inset?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4 px-4 py-3.5',
        inset ? 'border-b border-line last:border-b-0' : 'rounded-md border border-line bg-bg',
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-display text-[13.5px] font-medium tracking-tighter text-fg">{title}</span>
          {badge && (
            <span className="rounded-sm bg-bg-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-muted">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-[12px] leading-snug text-fg-muted">{body}</span>
      </span>
      <Switch checked={checked} onChange={onChange} />
    </label>
  )
}

function ComplianceRow({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-fg">{children}</span>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em]',
          on ? 'bg-status-live-soft text-status-live' : 'bg-bg-muted text-fg-muted',
        )}
      >
        {on ? <Icon name="check" size="xs" square={false} /> : <Icon name="x" size="xs" square={false} />}
        {on ? 'on' : 'off'}
      </span>
    </li>
  )
}

function PreviewCard({
  tierDef,
  voice,
  language,
  firstMessage,
  name,
  latency,
}: {
  tierDef: TierDef
  voice: VoicePreset
  language: AgentLanguage
  firstMessage: string
  name: string
  latency: string
}) {
  const englishPreview = language === 'en-US'
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg shadow-card">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
        </div>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">
          Live preview · {tierDef.badge}
        </span>
      </div>

      <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fg text-fg-inverse text-[12px] font-semibold">
          {voice.name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[13px] font-medium tracking-tighter text-fg">
            {name || `${voice.name} · agent`}
          </span>
          <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
            {tierDef.title} · {voice.accent}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-status-live-soft px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-status-live">
          <span className="size-1.5 rounded-full bg-status-live" />
          live
        </span>
      </div>

      <div className="space-y-2 px-3 py-3">
        <Bubble side="agent">
          <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">
            {voice.name} · 0:00
          </span>
          <span
            className={cn(
              'mt-1 block text-[12.5px] leading-snug text-fg',
              !englishPreview && 'font-bangla',
            )}
          >
            {firstMessage || '—'}
          </span>
        </Bubble>
        <Bubble side="caller">
          <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-inverse/70">
            Caller · 0:04
          </span>
          <span
            className={cn(
              'mt-1 block text-[12.5px] leading-snug text-fg-inverse',
              !englishPreview && 'font-bangla',
            )}
          >
            {englishPreview
              ? 'Hi, can you check my order #4820?'
              : 'হ্যালো, আমার অর্ডার #৪৮২০-এর স্ট্যাটাস বলবেন?'}
          </span>
        </Bubble>
        <Bubble side="agent" muted>
          <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">
            {voice.name} · typing
          </span>
          <span className="mt-1 inline-flex items-center gap-1">
            <Dot delay={0} />
            <Dot delay={150} />
            <Dot delay={300} />
          </span>
        </Bubble>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <Wave seed={voice.seed} tall />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-faint">
          {latency} · first response
        </span>
      </div>
    </div>
  )
}

function Bubble({
  side,
  muted,
  children,
}: {
  side: 'agent' | 'caller'
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-md px-3 py-2',
        side === 'agent' ? 'bg-bg-subtle' : 'bg-fg text-fg-inverse',
        muted && 'opacity-70',
      )}
    >
      {children}
    </div>
  )
}

function Wave({ seed, tall }: { seed: number[]; tall?: boolean }) {
  const max = Math.max(...seed)
  const h = tall ? 18 : 10
  return (
    <span className="flex items-end gap-[2px]" aria-hidden>
      {seed.map((v, i) => (
        <span
          key={i}
          className="block w-[2px] rounded-sm bg-fg-faint"
          style={{ height: `${(v / max) * h + 2}px` }}
        />
      ))}
    </span>
  )
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="size-1.5 rounded-full bg-fg/60"
      style={{ animation: 'caret-blink 1.2s ease-in-out infinite', animationDelay: `${delay}ms` }}
    />
  )
}
