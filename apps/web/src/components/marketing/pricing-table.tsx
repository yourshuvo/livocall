import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

interface Row {
  tier: string
  cost: string
  sell: string
  best_en: string
  best_bn: string
}

const ROWS: Row[] = [
  { tier: 'Retention support', cost: '৳3.80', sell: '৳7.00', best_en: 'VIP callers and escalations', best_bn: 'VIP caller ও escalation' },
  { tier: 'Revenue calls', cost: '৳3.60', sell: '৳6.00', best_en: 'COD, leads, appointments', best_bn: 'COD, lead, appointment' },
  { tier: 'Payment reminders', cost: '৳0.85', sell: '৳2.00', best_en: 'EMI, renewals, invoices', best_bn: 'EMI, renewal, invoice' },
]

export function PricingTable({ locale }: { locale: Locale }) {
  const bangla = locale === 'bn'
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line bg-bg-subtle/60 text-left">
            <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
              {bangla ? 'ব্যবসার কাজ' : 'Business job'}
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
              {bangla ? 'খরচ / মিনিট' : 'Cost / min'}
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
              {bangla ? 'মূল্য / মিনিট' : 'Price / min'}
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
              {bangla ? 'যেখানে ROI' : 'ROI fit'}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr
              key={r.tier}
              className={cn(
                'transition hover:bg-bg-subtle/40',
                i !== ROWS.length - 1 && 'border-b border-line',
              )}
            >
              <td className="px-5 py-4 font-display text-[14px] font-medium tracking-tighter text-fg">
                {r.tier}
              </td>
              <td className="px-5 py-4 text-right font-mono text-[12px] text-fg-faint">{r.cost}</td>
              <td className="px-5 py-4 text-right font-mono text-[14px] font-medium text-fg">{r.sell}</td>
              <td className={cn('px-5 py-4 text-right text-[12px] text-fg-muted', bangla && 'font-bangla')}>
                {bangla ? r.best_bn : r.best_en}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line bg-bg-subtle/40">
            <td colSpan={4} className="px-5 py-3 text-right font-mono text-[11px] text-fg-faint">
              {bangla ? 'সব মূল্য বিডিটিতে · usage ও add-on cost আলাদা হতে পারে' : 'All prices in BDT · usage and add-on costs may apply separately'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
