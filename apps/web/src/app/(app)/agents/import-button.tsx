'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'

interface ImportPayload {
  name?: string
  description?: string
  tier?: 'gemini_live' | 'grok_voice' | 'pipeline' | 'dtmf'
  model?: string
  language?: 'bn-BD' | 'en-US' | 'bn-en-mixed'
  voice?: { provider?: string; voiceId?: string; style?: string }
  prompt?: { system?: string; firstMessage?: string; guardrails?: string }
  postCallWebhook?: string
}

export function AgentsImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onFile(file: File | undefined) {
    if (!file) return
    setLoading(true)
    try {
      const text = await file.text()
      const raw = JSON.parse(text) as ImportPayload
      const created = await api.post<{ id: string }>('/api/agents', {
        name: raw.name || file.name.replace(/\.json$/i, ''),
        description: raw.description || '',
        tier: raw.tier || 'gemini_live',
        model: raw.model || '',
        language: raw.language || 'bn-en-mixed',
        voice: {
          provider: raw.voice?.provider || 'gemini-live',
          voiceId: raw.voice?.voiceId || 'aoede',
          style: raw.voice?.style || 'conversational',
        },
        prompt: {
          system: raw.prompt?.system || '',
          firstMessage: raw.prompt?.firstMessage || '',
          guardrails: raw.prompt?.guardrails || '',
        },
        postCallWebhook: raw.postCallWebhook || '',
      })
      router.push(`/agents/${created.id}`)
      router.refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted disabled:opacity-60"
      >
        <Icon name="upload" size="xs" />
        {loading ? 'Importing…' : 'Import'}
      </button>
    </>
  )
}
