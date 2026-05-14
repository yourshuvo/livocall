'use client'
import * as React from 'react'
import { cn } from '@/lib/cn'

type Tone = 'success' | 'error' | 'info'
type ToastItem = { id: number; message: string; tone: Tone }

type Ctx = {
  toast: (message: string, tone?: Tone) => void
}

const ToastCtx = React.createContext<Ctx | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])
  const toast = React.useCallback((message: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs, { id, message, tone }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[320px] flex-col gap-2">
        {items.map((it) => (
          <div
            key={it.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-md border bg-bg px-3 py-2 text-[13px] shadow-card',
              it.tone === 'success' && 'border-status-live/40 text-fg',
              it.tone === 'error' && 'border-status-fail/40 text-fg',
              it.tone === 'info' && 'border-line text-fg',
            )}
          >
            {it.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): Ctx {
  const c = React.useContext(ToastCtx)
  if (c) return c
  // Fallback: render via console so non-providered components still work
  return {
    toast: (m) => {
      // eslint-disable-next-line no-console
      console.warn('[toast]', m)
    },
  }
}
