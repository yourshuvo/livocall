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
        'inline-flex items-center rounded-md ring-1 ring-line bg-bg-subtle p-0.5 text-[11px] font-medium',
        pending && 'opacity-60',
      )}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => set('en')}
        className={cn(
          'rounded-[5px] px-2 py-1 transition-colors',
          locale === 'en' ? 'bg-bg text-fg shadow-card' : 'text-fg-subtle hover:text-fg',
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => set('bn')}
        className={cn(
          'rounded-[5px] px-2 py-1 font-bangla transition-colors',
          locale === 'bn' ? 'bg-bg text-fg shadow-card' : 'text-fg-subtle hover:text-fg',
        )}
      >
        বাংলা
      </button>
    </div>
  )
}
