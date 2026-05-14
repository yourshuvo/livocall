import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

const OUTCOMES = [
  'Missed-call recovery',
  'COD confirmation',
  'Payment reminders',
  'Lead qualification',
  'Customer retention',
  'Human handoff',
  'Cost per outcome',
  'Trust-ready growth',
]
export function LogoStrip({ locale }: { locale: Locale }) {
  const bangla = locale === 'bn'
  return (
    <div className="overflow-hidden">
      <div className="border-y border-line bg-bg-subtle/40 py-6">
        <p
          className={cn(
            'mb-5 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint',
            bangla && 'font-bangla',
          )}
        >
          {bangla
            ? 'Feature নয় — যেসব outcome business owner track করতে চায়'
            : 'Not feature names — the outcomes business owners care about'}
        </p>
        <div className="relative" style={{ maskImage: 'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)' }}>
          <div className="marquee-track animate-marquee items-center gap-3">
            {[...OUTCOMES, ...OUTCOMES].map((outcome, i) => (
              <span
                key={`${outcome}-${i}`}
                className="inline-flex rounded-full border border-line bg-bg px-4 py-2 font-display text-[15px] font-medium tracking-tighter text-fg-muted transition hover:text-fg"
              >
                {outcome}
              </span>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-6 grid max-w-screen-lg grid-cols-2 gap-3 px-6 sm:grid-cols-4">
          {['E-commerce', 'Clinics', 'Education', 'Finance'].map((logo) => (
            <div
              key={logo}
              className="rounded-xl border border-dashed border-line bg-bg px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint"
            >
              {logo}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
