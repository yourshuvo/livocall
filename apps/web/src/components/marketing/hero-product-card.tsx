'use client'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/icon'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

const HERO_CARD_BACKGROUND_URL = 'https://cdn.hackclub.com/019ea144-8633-7feb-9924-f88a8610d274/frosted-hero.png'

interface Turn {
  role: 'agent' | 'caller'
  en: string
  bn: string
}

const SCRIPT: Turn[] = [
  { role: 'agent', en: 'Assalamu alaikum — confirming your COD order.', bn: 'আসসালামু আলাইকুম — আপনার COD order confirm করছি।' },
  { role: 'caller', en: 'Yes, deliver it tomorrow afternoon.', bn: 'হ্যাঁ, কাল বিকেলে delivery দিন।' },
  { role: 'agent', en: 'Confirmed. I’ll update delivery and send the invoice link.', bn: 'Confirmed. Delivery update করে invoice link পাঠাচ্ছি।' },
  { role: 'caller', en: 'Great. Thank you.', bn: 'ভালো। ধন্যবাদ।' },
]

export function HeroProductCard({ locale }: { locale: Locale }) {
  const [step, setStep] = useState(0)
  const [seconds, setSeconds] = useState(8)
  useEffect(() => {
    const a = setInterval(() => setStep((s) => (s + 1) % (SCRIPT.length + 1)), 2400)
    const b = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => {
      clearInterval(a)
      clearInterval(b)
    }
  }, [])
  const visible = SCRIPT.slice(0, Math.min(step + 1, SCRIPT.length))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return (
    <div className="relative w-full max-w-md">
      {/* corner crosshair markers */}
      <span className="absolute inset-0 cross-tl cross-tr cross-bl cross-br pointer-events-none" />
      <div className="relative overflow-hidden rounded-xl border border-line bg-bg shadow-pop">
        <img
          src={HERO_CARD_BACKGROUND_URL}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-white/72 backdrop-blur-[1px]" />
        <div className="relative z-10">
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            session · {mm}:{ss}
          </span>
        </div>

        {/* call header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-md border border-line bg-bg-subtle">
              <Icon name="bot" size="lg" square={false} />
            </div>
            <div>
              <p className="text-[13px] font-medium leading-tight text-fg">
                Revenue recovery agent
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
                COD · payment · handoff
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-status-live-soft px-2 py-0.5 text-[10px] font-medium text-status-live">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-status-live opacity-60 animate-pulse-ring" />
              <span className="relative inline-flex size-1.5 rounded-full bg-status-live" />
            </span>
            live
          </div>
        </div>

        {/* caller meta */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[11px]">
          <div className="flex items-center gap-2 text-fg-muted">
            <Icon name="phone-in" size="sm" />
            <span className="font-mono">+880 17 1234 5678</span>
          </div>
          <span className="font-mono text-fg-faint">order confirmed · ৳2,450</span>
        </div>

        {/* transcript */}
        <div className="space-y-2.5 p-4">
          {visible.map((t, i) => {
            const isAgent = t.role === 'agent'
            const isLast = i === visible.length - 1
            return (
              <div
                key={i}
                className={cn('flex animate-fade-up', isAgent ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'max-w-[78%] rounded-md px-2.5 py-1.5 text-[12.5px] leading-snug',
                    isAgent
                      ? 'border border-line bg-bg-subtle text-fg'
                      : 'bg-fg text-fg-inverse',
                    locale === 'bn' && 'font-bangla',
                    isLast && isAgent && 'caret',
                  )}
                >
                  {locale === 'bn' ? t.bn : t.en}
                </div>
              </div>
            )
          })}
        </div>

        {/* waveform footer */}
        <div className="flex items-center justify-between border-t border-line bg-bg-subtle px-4 py-2.5">
          <div className="flex items-center gap-2 text-fg-muted">
            <Icon name="mic" size="sm" />
            <div className="flex items-end gap-[2px]">
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'block w-[2px] origin-bottom rounded-sm bg-fg/60',
                    i % 3 === 0 ? 'animate-wave-1' : i % 3 === 1 ? 'animate-wave-2' : 'animate-wave-3',
                  )}
                  style={{ height: `${6 + ((i * 7) % 14)}px`, animationDelay: `${(i % 5) * 60}ms` }}
                />
              ))}
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            outcome · confirmed
          </span>
        </div>
      </div>
      </div>

      {/* floating chip */}
      <div className="absolute -right-3 -top-4 flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted shadow-card">
        <span className="size-1 rounded-full bg-fg" /> call
        <span className="text-fg-faint">→</span> confirm
        <span className="text-fg-faint">→</span> revenue
      </div>
    </div>
  )
}
