import { Icon } from '@/components/ui/icon'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

interface Row {
  label_en: string
  label_bn: string
  bd: string | true
  offshore: string | false
}

const ROWS: Row[] = [
  {
    label_en: 'Missed-call recovery',
    label_bn: 'Missed-call recovery',
    bd: 'automatic',
    offshore: 'manual callback',
  },
  { label_en: 'COD and delivery confirmation', label_bn: 'COD and delivery confirmation', bd: true, offshore: false },
  { label_en: 'Payment and renewal follow-up', label_bn: 'Payment and renewal follow-up', bd: true, offshore: false },
  { label_en: 'Business-policy answers', label_bn: 'Business-policy answers', bd: true, offshore: false },
  {
    label_en: 'Human handoff for priority calls',
    label_bn: 'Human handoff for priority calls',
    bd: 'built in',
    offshore: 'separate tools',
  },
  { label_en: 'Cost and outcome visibility', label_bn: 'Cost and outcome visibility', bd: 'ROI dashboard', offshore: 'manual sheets' },
]

export function ComparisonTable({ locale }: { locale: Locale }) {
  const bangla = locale === 'bn'
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg">
      <div className="grid grid-cols-[1.5fr_1fr_1fr] items-center gap-4 border-b border-line bg-bg-subtle/60 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
        <span className={cn(bangla && 'font-bangla')}>{bangla ? 'ব্যবসার ফল' : 'Business result'}</span>
        <img
          src="https://res.cloudinary.com/dfb3ym0jr/image/upload/v1779089995/file_00000000f26c71fa9ffe8fb9cb675e19_wxjm8x.png"
          alt="LivoCall"
          className="h-5 w-auto inline-block"
        />
        <span>{bangla ? 'ম্যানুয়াল পদ্ধতি' : 'Manual process'}</span>
      </div>
      <div className="divide-y divide-line">
        {ROWS.map((row) => (
          <div
            key={row.label_en}
            className="grid grid-cols-[1.5fr_1fr_1fr] items-center gap-4 px-5 py-4 text-[13.5px]"
          >
            <span className={cn('text-fg-muted', bangla && 'font-bangla')}>
              {bangla ? row.label_bn : row.label_en}
            </span>
            <span className="font-mono text-fg">
              {row.bd === true ? (
                <Icon name="check" size="sm" square={false} className="text-fg" />
              ) : (
                row.bd
              )}
            </span>
            <span className="font-mono text-fg-faint">
              {row.offshore === false ? (
                <Icon name="x" size="sm" square={false} className="text-fg-faint" />
              ) : (
                row.offshore
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
