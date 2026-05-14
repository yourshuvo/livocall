import { Icon, type IconName } from '@/components/ui/icon'
import { AssetPlaceholder } from '@/components/marketing/asset-placeholder'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

interface UseCase {
  id: string
  icon: IconName
  title_en: string
  title_bn: string
  body_en: string
  body_bn: string
  bullets_en: string[]
  bullets_bn: string[]
  tier: 'T1' | 'T2' | 'T3'
}

const CASES: UseCase[] = [
  {
    id: 'ecommerce',
    icon: 'shopping-bag',
    title_en: 'E-commerce & D2C',
    title_bn: 'ই-কমার্স ও D2C',
    body_en: 'Confirm COD orders faster, reduce fake deliveries, and answer “where is my order?” without adding headcount.',
    body_bn: 'COD order দ্রুত confirm, fake delivery কমানো এবং agent না বাড়িয়েই order প্রশ্নের উত্তর।',
    bullets_en: ['Reduce failed delivery cost', 'Recover abandoned carts', 'Escalate high-value buyers'],
    bullets_bn: ['Failed delivery cost কমান', 'Abandoned cart recover', 'High-value buyer escalate'],
    tier: 'T2',
  },
  {
    id: 'finance',
    icon: 'wallet',
    title_en: 'Banking, MFS & loans',
    title_bn: 'ব্যাংকিং, MFS ও ঋণ',
    body_en: 'Remind borrowers, verify suspicious activity, and protect sensitive customer data while scaling outreach.',
    body_bn: 'Borrower reminder, suspicious activity verify এবং outreach scale করেও sensitive data protect।',
    bullets_en: ['Improve collection rate', 'Reduce manual reminder work', 'Keep audit evidence'],
    bullets_bn: ['Collection rate বাড়ান', 'Manual reminder কমান', 'Audit evidence রাখুন'],
    tier: 'T1',
  },
  {
    id: 'healthcare',
    icon: 'stethoscope',
    title_en: 'Healthcare & clinics',
    title_bn: 'স্বাস্থ্যসেবা ও ক্লিনিক',
    body_en: 'Cut no-shows, remind patients, and route urgent calls to staff before schedules fall apart.',
    body_bn: 'No-show কমান, patient reminder দিন এবং urgent call staff-এ route করুন।',
    bullets_en: ['Protect doctor schedules', 'Reduce front-desk load', 'Escalate urgent patients'],
    bullets_bn: ['Doctor schedule protect', 'Front-desk load কমান', 'Urgent patient escalate'],
    tier: 'T2',
  },
  {
    id: 'retail',
    icon: 'building',
    title_en: 'Retail & franchises',
    title_bn: 'রিটেইল ও ফ্র্যাঞ্চাইজ',
    body_en: 'Answer branch, stock, opening-hours, and loyalty questions so store teams stay focused on buyers.',
    body_bn: 'Branch, stock, opening-hours ও loyalty প্রশ্ন answer করে store team-কে buyer-এ focus রাখুন।',
    bullets_en: ['Reduce repetitive calls', 'Guide buyers to branches', 'Support loyalty follow-up'],
    bullets_bn: ['Repetitive call কমান', 'Buyer-কে branch-এ guide', 'Loyalty follow-up support'],
    tier: 'T3',
  },
  {
    id: 'education',
    icon: 'graduation',
    title_en: 'Education & ed-tech',
    title_bn: 'শিক্ষা ও এড-টেক',
    body_en: 'Qualify admission leads, remind tuition payments, and follow up with parents at scale.',
    body_bn: 'Admission lead qualify, tuition payment reminder এবং parent follow-up scale করুন।',
    bullets_en: ['Increase admission conversion', 'Reduce unpaid tuition', 'Prioritize hot leads'],
    bullets_bn: ['Admission conversion বাড়ান', 'Unpaid tuition কমান', 'Hot lead prioritize'],
    tier: 'T2',
  },
  {
    id: 'support',
    icon: 'headset',
    title_en: 'Customer support',
    title_bn: 'কাস্টমার সাপোর্ট',
    body_en: 'Deflect repetitive calls, keep service quality consistent, and surface gaps that cost retention.',
    body_bn: 'Repeat call deflect, service quality consistent এবং retention-costing gap surface করুন।',
    bullets_en: ['Lower ticket volume', 'Improve first response time', 'Handoff frustrated customers'],
    bullets_bn: ['Ticket volume কমান', 'First response time উন্নত', 'Frustrated customer handoff'],
    tier: 'T1',
  },
]

export function UseCases({ locale }: { locale: Locale }) {
  const bangla = locale === 'bn'
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
      {CASES.map((c) => (
        <article key={c.id} className="group relative flex flex-col gap-5 bg-bg p-6 transition hover:bg-bg-subtle/60">
          <div className="flex items-center justify-between">
            <span className="grid size-9 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
              <Icon name={c.icon} size="md" />
            </span>
            <span className="rounded-full border border-line bg-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
              {c.tier}
            </span>
          </div>
          <AssetPlaceholder
            icon={c.icon}
            label={`${c.id}.png`}
            caption={bangla ? 'Later: business ROI visual দিন।' : 'Later: add business ROI visual.'}
            compact
          />
          <div>
            <h3
              className={cn(
                'font-display text-[20px] font-medium leading-tight tracking-tighter text-fg',
                bangla && 'font-bangla',
              )}
            >
              {bangla ? c.title_bn : c.title_en}
            </h3>
            <p
              className={cn(
                'mt-2 text-[13.5px] leading-relaxed text-fg-muted',
                bangla && 'font-bangla',
              )}
            >
              {bangla ? c.body_bn : c.body_en}
            </p>
          </div>
          <ul className="mt-auto space-y-1.5 border-t border-line pt-4 text-[12.5px] text-fg-muted">
            {(bangla ? c.bullets_bn : c.bullets_en).map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Icon name="check" size="xs" className="mt-0.5 text-fg" />
                <span className={cn(bangla && 'font-bangla')}>{b}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}
