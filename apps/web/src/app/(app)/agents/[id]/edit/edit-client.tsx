'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'
import { defaultLanguageForTier, languageOptionsForTier } from '@/types/agent'

interface AgentDto {
  id: string
  name: string
  description: string
  tier: 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
  language: string
  voice: { provider: string; voiceId: string; style: string }
  prompt: { system: string; firstMessage: string; guardrails: string }
  knowledgeBaseIds: string[]
  postCallWebhook: string
  status: 'draft' | 'live'
}

type Tier = AgentDto['tier']

const DEFAULT_VOICE: Record<Tier, { provider: string; voiceId: string; style: string }> = {
  gemini_live: { provider: 'gemini-live', voiceId: 'aoede', style: 'bilingual' },
  grok_voice: { provider: 'xai', voiceId: 'rohan', style: 'friendly' },
  pipeline: { provider: 'cartesia', voiceId: 'cimo', style: 'conversational' },
  dtmf: { provider: 'gemini-tts', voiceId: 'news-bn', style: 'news' },
}

interface KbOption {
  id: string
  name: string
}

export function EditAgentForm({
  initial,
  kbs,
}: {
  initial: AgentDto
  kbs: KbOption[]
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [tier, setTier] = useState(initial.tier)
  const [language, setLanguage] = useState(initial.language)
  const [voiceProvider, setVoiceProvider] = useState(initial.voice?.provider || 'cartesia')
  const [voiceId, setVoiceId] = useState(initial.voice?.voiceId || '')
  const [voiceStyle, setVoiceStyle] = useState(initial.voice?.style || 'conversational')
  const [systemPrompt, setSystemPrompt] = useState(initial.prompt?.system || '')
  const [firstMessage, setFirstMessage] = useState(initial.prompt?.firstMessage || '')
  const [guardrails, setGuardrails] = useState(initial.prompt?.guardrails || '')
  const [webhook, setWebhook] = useState(initial.postCallWebhook || '')
  const [selectedKbs, setSelectedKbs] = useState<string[]>(initial.knowledgeBaseIds || [])
  const [pending, start] = useTransition()
  const { toast } = useToast()

  useEffect(() => {
    const expected = DEFAULT_VOICE[tier]
    if (expected && voiceProvider !== expected.provider) {
      setVoiceProvider(expected.provider)
      setVoiceId(expected.voiceId)
      setVoiceStyle(expected.style)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, voiceProvider])

  useEffect(() => {
    const languages = languageOptionsForTier(tier)
    if (!languages.some((l) => l.k === language)) {
      setLanguage(defaultLanguageForTier(tier))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, language])

  function toggleKb(id: string) {
    setSelectedKbs((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  }

  function save() {
    if (!name.trim()) {
      toast('Name is required', 'error')
      return
    }
    start(async () => {
      try {
        await api.patch(`/api/agents/${initial.id}`, {
          name,
          description,
          tier,
          language,
          voice: { provider: voiceProvider, voiceId, style: voiceStyle },
          prompt: { system: systemPrompt, firstMessage, guardrails },
          knowledgeBaseIds: selectedKbs,
          postCallWebhook: webhook,
        })
        toast('Agent updated', 'success')
        router.push(`/agents/${initial.id}`)
        router.refresh()
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <div className="border-b border-line p-5">
          <CardTitle>Identity</CardTitle>
          <CardDescription>Name and the internal description for this agent.</CardDescription>
        </div>
        <CardBody className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              className="mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Onboarding agent"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              className="mt-2"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of what this agent does"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <div className="border-b border-line p-5">
          <CardTitle>Engine</CardTitle>
          <CardDescription>Which stack the call rides on.</CardDescription>
        </div>
        <CardBody className="space-y-3">
          <div>
            <Label>Tier</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {(
                [
                  { k: 'gemini_live', t: 'T1 · Gemini Live', s: 'real-time, barge-in' },
                  { k: 'grok_voice', t: 'Grok Voice', s: 'xAI realtime voice' },
                  { k: 'pipeline', t: 'T2 · Pipeline', s: 'STT+LLM+TTS' },
                  { k: 'dtmf', t: 'T3 · DTMF', s: 'menu / IVR' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.k}
                  type="button"
                  onClick={() => setTier(opt.k)}
                  className={
                    'rounded-md border px-3 py-2 text-left text-[12.5px] ' +
                    (tier === opt.k
                      ? 'border-fg/40 bg-fg/5 text-fg'
                      : 'border-line text-fg-muted hover:border-fg/30')
                  }
                >
                  <span className="block font-medium text-fg">{opt.t}</span>
                  <span className="block text-[11px] text-fg-muted">{opt.s}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Language</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {languageOptionsForTier(tier).map((l) => (
                <button
                  key={l.k}
                  type="button"
                  onClick={() => setLanguage(l.k)}
                  className={
                    'rounded-full border px-2 py-0.5 font-mono text-[11px] ' +
                    (language === l.k
                      ? 'border-fg/40 bg-fg/5 text-fg'
                      : 'border-line text-fg-muted hover:border-fg/30')
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Voice provider</Label>
              <Input
                className="mt-2 font-mono text-xs"
                value={voiceProvider}
                onChange={(e) => setVoiceProvider(e.target.value)}
              />
            </div>
            <div>
              <Label>Voice ID</Label>
              <Input
                className="mt-2 font-mono text-xs"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
              />
            </div>
            <div>
              <Label>{tier === 'grok_voice' ? 'Tone' : 'Style'}</Label>
              <Input
                className="mt-2 font-mono text-xs"
                value={voiceStyle}
                onChange={(e) => setVoiceStyle(e.target.value)}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <div className="border-b border-line p-5">
          <CardTitle>Prompts</CardTitle>
          <CardDescription>What the agent says and how it thinks.</CardDescription>
        </div>
        <CardBody className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>First message</Label>
            <Textarea
              className="mt-2"
              rows={2}
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="Said as soon as the call connects"
            />
          </div>
          <div>
            <Label>System prompt</Label>
            <Textarea
              className="mt-2"
              rows={8}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>
          <div>
            <Label>Guardrails</Label>
            <Textarea
              className="mt-2"
              rows={8}
              value={guardrails}
              onChange={(e) => setGuardrails(e.target.value)}
              placeholder="Things the agent must never do or say"
            />
          </div>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <div className="border-b border-line p-5">
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Knowledge bases and post-call webhook.</CardDescription>
        </div>
        <CardBody className="space-y-3">
          <div>
            <Label>Knowledge bases</Label>
            {kbs.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-fg-muted">
                No knowledge bases yet — create one in the Knowledge section.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {kbs.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => toggleKb(k.id)}
                    className={
                      'rounded-full border px-2 py-0.5 text-[11.5px] ' +
                      (selectedKbs.includes(k.id)
                        ? 'border-fg/40 bg-fg/5 text-fg'
                        : 'border-line text-fg-muted hover:border-fg/30')
                    }
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Post-call webhook</Label>
            <Input
              className="mt-2 font-mono text-xs"
              placeholder="https://your-app.example/livocall/call-ended"
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      <div className="lg:col-span-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          Save changes
        </Button>
      </div>
    </div>
  )
}
