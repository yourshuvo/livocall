'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

export function LangSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function set(next: Locale) {
    document.cookie = `livocall_locale=${next}; path=/; max-age=31536000; samesite=lax`
    start(() => router.refresh())
  }

  return (
    <div
      className={cn(
        'inline-flex h-8 items-center rounded-full border border-[#D2D4D6] bg-[#F5F5F7] p-0.5 text-[11px] font-semibold backdrop-blur transition',
        pending && 'opacity-60',
      )}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => set('en')}
        className={cn(
          'h-7 rounded-full px-2.5 transition-colors',
          locale === 'en' ? 'border border-[#D2D4D6] bg-white text-fg' : 'text-fg-muted hover:text-fg',
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => set('bn')}
        className={cn(
          'h-7 rounded-full px-2.5 transition-colors',
          locale === 'bn' ? 'border border-[#D2D4D6] bg-white text-fg' : 'text-fg-muted hover:text-fg',
        )}
      >
        BN
      </button>
    </div>
  )
}
