import { Icon, type IconName } from '@/components/ui/icon'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

interface Step {
  id: string
  icon: IconName
  title_en: string
  title_bn: string
  meta: string
}

const STEPS: Step[] = [
  { id: '01', icon: 'phone-in', title_en: 'Demand comes in', title_bn: 'Demand আসে', meta: 'missed call · campaign · reminder' },
  { id: '02', icon: 'book', title_en: 'Business answer', title_bn: 'Business answer', meta: 'faq · policy · order rules' },
  { id: '03', icon: 'shield-check', title_en: 'Outcome captured', title_bn: 'Outcome captured', meta: 'confirmed · paid · escalated' },
  { id: '04', icon: 'activity', title_en: 'ROI reviewed', title_bn: 'ROI reviewed', meta: 'revenue · cost · gaps' },
]

export function FlowDiagram({ locale }: { locale: Locale }) {
  const bangla = locale === 'bn'
  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s.id} className="relative flex flex-col gap-5 bg-bg p-6">
          {i < STEPS.length - 1 && (
            <span
              aria-hidden
              className="absolute right-0 top-1/2 hidden h-px w-4 -translate-y-1/2 translate-x-2 bg-line md:block"
            />
          )}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
              {s.id}
            </span>
            <span className="grid size-8 place-items-center rounded-md border border-line bg-bg-subtle">
              <Icon name={s.icon} size="md" square={false} />
            </span>
          </div>
          <div>
            <p
              className={cn(
                'font-display text-[19px] font-medium tracking-tighter text-fg',
                bangla && 'font-bangla',
              )}
            >
              {bangla ? s.title_bn : s.title_en}
            </p>
            <p className="mt-1 font-mono text-[11px] text-fg-faint">{s.meta}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
