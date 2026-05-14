'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'
import {
  EMPTY_AGENT_BUILDER,
  buildBanglaAgentPrompt,
  type AgentBuilderAnswers,
  type GeneratedAgentPrompt,
} from '@/lib/bangla-agent-builder'

const QUESTIONS: {
  key: keyof AgentBuilderAnswers
  label: string
  hint: string
  textarea?: boolean
  placeholder?: string
}[] = [
  { key: 'businessName', label: 'ব্যবসার নাম কী?', hint: 'যেমন: Livocall, ABC Clinic', placeholder: 'ABC Clinic' },
  { key: 'agentName', label: 'AI agent-এর নাম কী হবে?', hint: 'কাস্টমার এই নাম শুনবে', placeholder: 'রিমা' },
  { key: 'industry', label: 'ব্যবসার ধরন কী?', hint: 'সাপোর্ট, সেলস, ক্লিনিক, ই-কমার্স...', placeholder: 'ই-কমার্স সাপোর্ট' },
  { key: 'callGoal', label: 'কলের মূল উদ্দেশ্য কী?', hint: 'এক লাইনে বলুন agent কী অর্জন করবে', textarea: true, placeholder: 'অর্ডার স্ট্যাটাস জানানো এবং প্রয়োজন হলে complaint নেওয়া' },
  { key: 'customerType', label: 'কার সাথে কথা বলবে?', hint: 'কাস্টমারের ধরন/লোকেশন/ভাষা', placeholder: 'বাংলাদেশি অনলাইন কাস্টমার' },
  { key: 'languageStyle', label: 'ভাষা ও টোন কেমন হবে?', hint: 'চাইলে ডিফল্ট রাখা যায়', textarea: true },
  { key: 'keyQuestions', label: 'কোন প্রশ্নগুলো অবশ্যই করবে?', hint: 'কমা বা নতুন লাইনে লিখুন', textarea: true, placeholder: 'অর্ডার নম্বর, ফোন নম্বর, সমস্যার ধরন' },
  { key: 'kbRules', label: 'Knowledge Base ব্যবহার কীভাবে করবে?', hint: 'না জানলে কী বলবে সেটাও লিখুন', textarea: true },
  { key: 'toolRules', label: 'Tools/functions কখন ব্যবহার করবে?', hint: 'যেমন order lookup, booking, CRM update', textarea: true },
  { key: 'transferRules', label: 'কখন human transfer করবে?', hint: 'মানুষ চাইলে, রাগ করলে, বা উত্তর না থাকলে', textarea: true },
  { key: 'complianceRules', label: 'কোন জিনিস কখনো করবে না?', hint: 'OTP/PIN/card/password, legal promises, etc.', textarea: true },
]

export function BanglaAgentBuilder({
  initial,
  onApply,
  onSkip,
}: {
  initial?: Partial<AgentBuilderAnswers>
  onApply: (prompt: GeneratedAgentPrompt) => void
  onSkip?: () => void
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<AgentBuilderAnswers>({
    ...EMPTY_AGENT_BUILDER,
    ...initial,
  })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = QUESTIONS[step]
  const value = answers[q.key]
  const generated = buildBanglaAgentPrompt(answers)
  const last = step === QUESTIONS.length - 1

  function update(key: keyof AgentBuilderAnswers, next: string) {
    setAnswers((a) => ({ ...a, [key]: next }))
  }

  async function generate() {
    setError(null)
    setGenerating(true)
    try {
      const prompt = await api.post<GeneratedAgentPrompt & { aiPowered?: boolean }>(
        '/api/agents/ai-builder',
        { answers },
      )
      onApply(prompt)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-line bg-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[16px] font-semibold tracking-tighter text-fg">
            Bangla AI Agent Builder
          </p>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            কয়েকটি প্রশ্নের উত্তর দিন, তারপর AI Bangla prompt তৈরি করবে। চাইলে Skip করে manual লিখতে পারেন।
          </p>
        </div>
        {onSkip && (
          <Button type="button" size="sm" variant="ghost" onClick={onSkip}>
            Skip
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1">
        {QUESTIONS.map((item, i) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setStep(i)}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-fg' : 'bg-bg-muted'}`}
            aria-label={`Go to question ${i + 1}`}
          />
        ))}
      </div>

      <div>
        <Label>
          {step + 1}. {q.label}
        </Label>
        <p className="mt-1 text-[12px] text-fg-muted">{q.hint}</p>
        {q.textarea ? (
          <Textarea
            className="mt-2 min-h-[96px] font-bangla"
            value={value}
            placeholder={q.placeholder}
            onChange={(e) => update(q.key, e.target.value)}
          />
        ) : (
          <Input
            className="mt-2 font-bangla"
            value={value}
            placeholder={q.placeholder}
            onChange={(e) => update(q.key, e.target.value)}
          />
        )}
      </div>

      <div className="rounded-md border border-line bg-bg-subtle p-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-faint">
          Fallback preview
        </p>
        <p className="line-clamp-4 whitespace-pre-wrap font-bangla text-[12px] text-fg-muted">
          {generated.system}
        </p>
      </div>
      {error && <p className="text-[12.5px] text-status-fail">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>
        <div className="flex gap-2">
          {!last && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          )}
          <Button type="button" size="sm" onClick={generate} disabled={generating} className="gap-1.5">
            <Icon name="sparkles" size="xs" /> {generating ? 'AI generating…' : 'Generate with AI'}
          </Button>
        </div>
      </div>
    </div>
  )
}
