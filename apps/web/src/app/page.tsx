import Link from 'next/link'
import { cookies } from 'next/headers'
import { Show, UserButton } from '@clerk/nextjs'
import type { ReactNode } from 'react'
import { LangSwitcher } from '@/components/lang-switcher'
import { MarketingFooter } from '@/components/marketing/footer'
import { PublicWebcallDemo } from '@/components/marketing/public-webcall-demo'
import { BrandIcon, Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'
import { getLocaleFromCookie, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

const NAV_ITEMS = [
  { href: '#product', label: 'Product' },
  { href: '#playbooks', label: 'Solutions' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
] as const

const TRUST_MARKS = ['E-commerce', 'Clinics', 'Education', 'Finance', 'Logistics']

const HERO_IMAGE_URL = '/assets/landing/frosted-hero.png'

const USE_CASE_CARDS = [
  {
    title: 'Missed-call recovery',
    bullets: [
      'Call shoppers back automatically after business hours',
      'Qualify urgency, language, budget, and product intent',
      'Route hot leads to the right team with transcript context',
    ],
    link: 'Learn about recovery',
    visual: 'review',
  },
  {
    title: 'Order confirmation + dispatch',
    bullets: [
      'Confirm COD orders before fulfillment',
      'Validate address, quantity, and delivery windows',
      'Send clean outcomes to ops without manual tagging',
    ],
    visual: 'compact',
  },
  {
    title: 'Issue triage + live handoff',
    bullets: [
      'Detect complaints and escalation language early',
      'Summarize the call for human agents',
      'Trigger Slack, webhook, or CRM follow-up',
    ],
    visual: 'thread',
  },
  {
    title: 'Knowledge base automation',
    bullets: [
      'Answer policy, pricing, return, and delivery questions',
      'Keep agents aligned to your uploaded business docs',
      'Flag missing answers for review',
    ],
    link: 'Learn about knowledge',
    visual: 'plain',
  },
  {
    title: 'Scheduled campaigns',
    bullets: [
      'Run payment reminders, renewal calls, and appointment nudges',
      'Review call outcomes continuously',
      'Maintain release notes for every call flow',
    ],
    visual: 'release',
  },
  {
    title: 'And many others',
    bullets: [
      'Clinic booking and reminders',
      'Education admissions follow-up',
      'Finance collection workflows',
      'Repetitive browser task automation',
    ],
    visual: 'plain',
  },
] as const

const PRODUCT_FEATURES: Array<{
  title: string
  body: string
  visual: 'roles' | 'routing' | 'org'
}> = [
  {
    title: 'Custom roles and permissions',
    body: 'Give sales, support, QA, and finance teams the right level of access to campaigns and call data.',
    visual: 'roles',
  },
  {
    title: 'Smart routing',
    body: 'Let agents decide when to resolve, retry, transfer, or create a ticket based on the call outcome.',
    visual: 'routing',
  },
  {
    title: 'Organization-ready UI',
    body: 'Manage workspaces, billing, team members, audit logs, and integrations from one clean console.',
    visual: 'org',
  },
]

const TESTIMONIALS = [
  {
    name: 'Nadia Rahman',
    handle: '@shopup_ops',
    quote:
      'Livocall helped our team recover missed calls without hiring a night shift. The summaries are clear enough for dispatch to act immediately.',
  },
  {
    name: 'Arif Hossain',
    handle: '@growthdesk',
    quote:
      'We use it for COD confirmation and payment reminders. The handoff notes save our agents from repeating the same discovery questions.',
  },
  {
    name: 'Tasnim Chowdhury',
    handle: '@clinicflow',
    quote:
      'The Bangla voice experience feels practical. It answers routine questions and leaves our team with only the calls that need care.',
  },
  {
    name: 'Rafiq Karim',
    handle: '@finopsbd',
    quote:
      'Spend caps, DNC, and audit logs made it much easier to approve automation for sensitive customer workflows.',
  },
] as const

const DEMO_TAGS = [
  'Receptionist',
  'Appointment Setter',
  'Lead Qualification',
  'Customer Service',
  'Debt Collection',
  'Survey',
] as const

const PROOF_METRICS = [
  ['24/7', 'call coverage'],
  ['87%', 'confirmed COD intent'],
  ['6 min', 'average handoff prep saved'],
  ['৳42', 'tracked cost per outcome'],
] as const

const WORKFLOW_STEPS: Array<{
  icon: IconName
  title: string
  body: string
}> = [
  {
    icon: 'book',
    title: 'Attach knowledge',
    body: 'Upload FAQs, policies, scripts, product details, and escalation rules before the agent makes a call.',
  },
  {
    icon: 'bot',
    title: 'Launch the agent',
    body: 'Choose a voice, language, campaign audience, phone number, and runtime guardrails.',
  },
  {
    icon: 'route',
    title: 'Route outcomes',
    body: 'Confirm orders, retry unanswered contacts, trigger webhooks, or hand off complex conversations.',
  },
  {
    icon: 'bar-chart',
    title: 'Measure the result',
    body: 'Review revenue recovered, cost per outcome, transcript quality, and every human follow-up.',
  },
]

const INDUSTRY_PLAYBOOKS: Array<{
  icon: IconName
  industry: string
  trigger: string
  task: string
  outcome: string
  integrations: string[]
}> = [
  {
    icon: 'shopping-bag',
    industry: 'E-commerce',
    trigger: 'Missed calls, COD orders, abandoned checkout, and delivery questions.',
    task: 'Confirm intent, address, quantity, payment preference, and escalation needs.',
    outcome: 'Cleaner dispatch queues and fewer wasted fulfillment attempts.',
    integrations: ['Shopify', 'WooCommerce', 'Slack'],
  },
  {
    icon: 'stethoscope',
    industry: 'Clinics',
    trigger: 'Appointment requests, no-shows, reminder calls, and routine patient questions.',
    task: 'Collect preferred times, confirm visit type, and hand off urgent cases.',
    outcome: 'More booked appointments with less front-desk repetition.',
    integrations: ['Calendar', 'Sheets', 'Webhook'],
  },
  {
    icon: 'graduation',
    industry: 'Education',
    trigger: 'Admissions leads, tuition follow-ups, course questions, and event reminders.',
    task: 'Qualify program interest, language preference, budget, and next-step readiness.',
    outcome: 'Faster lead response and clearer counselor handoff notes.',
    integrations: ['CRM', 'Email', 'Slack'],
  },
  {
    icon: 'wallet',
    industry: 'Finance',
    trigger: 'Payment reminders, EMI follow-up, document collection, and renewal calls.',
    task: 'Confirm identity-safe details, log promise-to-pay status, and route disputes.',
    outcome: 'Trackable collections workflows with audit-ready call outcomes.',
    integrations: ['Webhook', 'CRM', 'Ledger'],
  },
  {
    icon: 'route',
    industry: 'Logistics',
    trigger: 'Delivery reschedules, failed delivery attempts, address checks, and rider callbacks.',
    task: 'Validate delivery instructions and send structured updates to operations.',
    outcome: 'Reduced failed attempts and faster exception resolution.',
    integrations: ['Dispatch', 'Sheets', 'API'],
  },
]

const SECURITY_CARDS: Array<{
  icon: IconName
  title: string
  body: string
}> = [
  {
    icon: 'shield-check',
    title: 'Guardrails by default',
    body: 'DNC, opt-out language, spend caps, escalation rules, and sensitive-data handling stay close to each workflow.',
  },
  {
    icon: 'database',
    title: 'Audit-ready data',
    body: 'Every call stores transcripts, outcome tags, cost, latency, tool events, and operator actions.',
  },
  {
    icon: 'building',
    title: 'Workspace controls',
    body: 'Use organization roles, member permissions, API keys, and billing visibility as your team grows.',
  },
]

const FAQ_ITEMS = [
  [
    'Can Livocall speak Bangla and English?',
    'Yes. Agents can be configured for Bangla, English, or mixed customer conversations, with scripts and knowledge tuned for each workflow.',
  ],
  [
    'What happens when a customer needs a human?',
    'Livocall creates a handoff summary with intent, sentiment, transcript highlights, and next action so your team can respond quickly.',
  ],
  [
    'Can I connect this to my existing stack?',
    'Use webhooks, API keys, and workspace integrations to sync calls, contacts, outcomes, and billing events.',
  ],
] as const

const KPI_ROWS = [
  { label: 'Recovered', value: '৳18.4k', tone: 'live' },
  { label: 'Orders', value: '87', tone: 'live' },
  { label: 'Handoffs', value: '6', tone: 'warn' },
]

export default async function LandingPage() {
  const cookieStore = await cookies()
  const locale: Locale = getLocaleFromCookie(cookieStore.get('livocall_locale')?.value)

  return (
    <main className="min-h-screen bg-bg text-fg">
      <Hero locale={locale} />
      <UseCasesSection />
      <IndustryPlaybooksSection />
      <ProofMetricsSection />
      <ProductSection />
      <WorkflowSection />
      <DarkPlatformSection />
      <SecuritySection />
      <TrustSection />
      <BuyerQuestionsSection />
      <LiveDemoSection />
      <MarketingFooter locale={locale} />
    </main>
  )
}

function Hero({ locale }: { locale: Locale }) {
  return (
    <section className="relative isolate flex min-h-screen overflow-hidden border-b border-line">
      <div className="absolute inset-0 -z-20 overflow-hidden bg-bg">
        <img
          src={HERO_IMAGE_URL}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      <div className="mx-auto flex w-full max-w-full flex-col overflow-hidden bg-transparent pb-32">
        <HomepageNav locale={locale} />

        <div className="relative flex flex-1 flex-col justify-center px-4 pb-7 pt-9 text-center sm:px-8 sm:pb-9 sm:pt-12 lg:px-12">
          <Link
            href="#features"
            className="announcement-animate hero-reveal relative z-10 mx-auto inline-flex max-w-full items-center gap-2 rounded-full border border-[#D2D4D6] bg-[#F5F5F7] px-2.5 py-1.5 text-[11px] text-fg backdrop-blur transition hover:bg-[#ECEDEF]"
          >
            <span className="rounded-full border border-[#D2D4D6] bg-white px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-fg">
              New
            </span>
            <span className="truncate">AI agents, campaigns, handoffs, and analytics in one place.</span>
            <Icon name="arrow-right" size="xs" square={false} className="shrink-0" />
          </Link>

          <h1 className="hero-reveal hero-reveal-2 relative z-10 mx-auto mt-6 max-w-4xl font-display text-[42px] font-medium leading-[0.95] tracking-tightest text-fg sm:text-[56px] lg:text-[72px]">
            The next-gen voice agent platform for revenue teams.
          </h1>
          <p className="hero-reveal hero-reveal-3 relative z-10 mx-auto mt-5 max-w-2xl text-[14.5px] leading-relaxed text-fg-muted sm:text-[16px]">
            Livocall combines AI voice agents, Bangla-ready call flows, campaign automation,
            knowledge, and handoff controls in a single polished workspace.
          </p>

          <div className="hero-reveal hero-reveal-4 relative z-10 mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-5">
              <Link href="/signup">
                Book a demo
                <Icon name="arrow-right" size="sm" square={false} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="rounded-full bg-white/80 px-5">
              <Link href="#product">
                <span className="grid size-8 place-items-center rounded-full border border-line bg-bg">
                  <BrandIcon className="size-6" />
                </span>
                View product
              </Link>
            </Button>
          </div>

          <HeroConsole />
          <TrustStrip />
        </div>
      </div>
    </section>
  )
}

function HomepageNav({ locale }: { locale: Locale }) {
  return (
    <div className="z-50 px-4 py-4 sm:px-6 w-full flex justify-center">
      <header className="flex w-full max-w-5xl items-center justify-between gap-4 rounded-full border border-white/50 bg-white/40 px-3 py-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:px-5">
        <Link href="/" className="inline-flex min-w-0 items-center group">
          <Wordmark className="h-6 max-w-[112px] transition-opacity group-hover:opacity-85 sm:h-7 sm:max-w-[132px]" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-fg-muted/90 transition-all hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <LangSwitcher locale={locale} />
          </div>
          <Show when="signed-out">
            <Link href="/login" className="hidden px-2 text-[13px] font-medium text-fg-muted/90 transition-all hover:text-fg sm:inline">
              Sign in
            </Link>
            <Button asChild size="sm" className="rounded-full px-5">
              <Link href="/signup">Get Started</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Link href="/overview" className="hidden rounded-full border border-[#D2D4D6] bg-[#F5F5F7] px-4 py-2 text-[13px] font-medium text-fg transition hover:bg-[#ECEDEF] sm:inline">
              Dashboard
            </Link>
            <UserButton />
          </Show>
        </div>
      </header>
    </div>
  )
}

function HeroConsole() {
  return (
    <div id="product" className="relative mx-auto mt-9 w-full max-w-[820px]">
      <div className="overflow-hidden rounded-[14px] border border-line bg-bg/50 backdrop-blur-md text-left">
        <div className="flex items-center justify-between border-b border-line bg-bg-subtle/40 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-[10px] text-fg-faint sm:flex">
            <span className="size-1.5 rounded-full bg-status-live" />
            4 calls live
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
            agent console
          </span>
        </div>

        <div className="grid min-h-[310px] grid-cols-1 md:grid-cols-[152px_1fr] lg:grid-cols-[152px_1fr_190px]">
          <aside className="hidden border-r border-line bg-bg-subtle/50 p-3 md:block">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-faint">Workspace</p>
            <p className="mt-1 truncate text-[12px] font-medium text-fg">ShopUp Express</p>
            <div className="mt-4 space-y-1">
              {[
                ['dashboard', 'Overview', true],
                ['bot', 'Agents', false],
                ['phone-call', 'Calls', false],
                ['shopping-bag', 'Orders', false],
                ['headset', 'Handoffs', false],
              ].map(([icon, label, active]) => (
                <div
                  key={label as string}
                  className={cn(
                    'flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[11.5px]',
                    active ? 'bg-bg text-fg shadow-card' : 'text-fg-muted',
                  )}
                >
                  <Icon name={icon as IconName} size="xs" square={false} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 bg-bg p-3 sm:p-4">
            <div className="mb-3 grid grid-cols-3 gap-2">
              {KPI_ROWS.map((item) => (
                <div key={item.label} className="rounded-[7px] border border-line bg-bg-subtle px-2.5 py-2">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-fg-faint">
                    {item.label}
                  </p>
                  <p className="mt-1 font-display text-[17px] font-medium tracking-tighter text-fg">
                    {item.value}
                  </p>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[10px]',
                      item.tone === 'live' ? 'text-status-live' : 'text-status-warn',
                    )}
                  >
                    <span
                      className={cn(
                        'size-1 rounded-full',
                        item.tone === 'live' ? 'bg-status-live' : 'bg-status-warn',
                      )}
                    />
                    today
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-[8px] border border-line bg-bg">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <div>
                  <p className="text-[12px] font-medium text-fg">COD confirmation agent</p>
                  <p className="text-[10px] text-fg-muted">Bangla voice, knowledge-backed, handoff ready</p>
                </div>
                <span className="rounded-full bg-status-live-soft px-2 py-0.5 text-[10px] font-medium text-status-live">
                  live
                </span>
              </div>
              <div className="space-y-3 p-3">
                <Message align="left" name="Customer">
                  Ami order ta confirm korte chai, delivery kalke hobe?
                </Message>
                <Message align="right" name="Livocall">
                  Yes. Address and COD amount matched. I can confirm the delivery window now.
                </Message>
                <Message align="left" name="Customer">
                  Payment change korte parbo?
                </Message>
                <Message align="right" name="Livocall">
                  I can collect that request and hand it to the dispatch team with this call summary.
                </Message>
              </div>
            </div>
          </div>

          <aside className="hidden border-l border-line bg-bg-subtle/60 p-3 lg:block">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-faint">Call intelligence</p>
            <div className="mt-3 space-y-2">
              {[
                ['Intent', 'Order confirmation'],
                ['Outcome', 'Confirmed'],
                ['Cost', '৳42'],
                ['Next step', 'Dispatch sync'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[7px] border border-line bg-bg px-2.5 py-2">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-fg-faint">
                    {label}
                  </p>
                  <p className="mt-1 truncate text-[11.5px] font-medium text-fg">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-[7px] border border-line bg-bg px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg">
                <Icon name="shield-check" size="xs" square={false} />
                Guardrails active
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fg-muted">
                DNC, spend caps, OTP/PIN rules, and audit logging are enabled.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Message({
  align,
  name,
  children,
}: {
  align: 'left' | 'right'
  name: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex', align === 'right' && 'justify-end')}>
      <div
        className={cn(
          'max-w-[78%] rounded-[8px] px-3 py-2 text-[11.5px] leading-relaxed shadow-card',
          align === 'right' ? 'bg-fg text-fg-inverse' : 'border border-line bg-bg-subtle text-fg',
        )}
      >
        <p className={cn('mb-1 font-mono text-[8px] uppercase tracking-[0.12em]', align === 'right' ? 'text-white/55' : 'text-fg-faint')}>
          {name}
        </p>
        {children}
      </div>
    </div>
  )
}

function TrustStrip() {
  return (
    <div className="mx-auto mt-8 max-w-3xl">
      <p className="text-center font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
        Built for the call-heavy teams behind
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {TRUST_MARKS.map((mark) => (
          <span
            key={mark}
            className="rounded-full border border-line bg-white/70 px-4 py-2 font-display text-[14px] font-medium tracking-tighter text-fg-muted shadow-card backdrop-blur"
          >
            {mark}
          </span>
        ))}
      </div>
    </div>
  )
}

function UseCasesSection() {
  return (
    <section id="features" className="border-b border-line bg-[#f7f7f8]">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="landing-reveal max-w-3xl">
          <h2 className="font-display text-[44px] font-semibold leading-[0.98] tracking-tight text-fg md:text-[72px]">
            Use cases
          </h2>
          <p className="mt-8 max-w-xl text-[18px] leading-relaxed text-fg">
            Use Livocall to plan and execute customer conversations, from missed-call recovery
            to COD confirmation and human handoff.
          </p>
        </div>

        <div className="landing-stagger mt-16 grid gap-5 md:grid-cols-3">
          {USE_CASE_CARDS.map((card, index) => (
            <article
              key={card.title}
              className={cn(
                'landing-motion-card flex min-h-[300px] flex-col overflow-hidden rounded-[12px] bg-[#ececec] p-7',
                (index === 0 || index === 2 || index === 4) && 'md:min-h-[470px]',
              )}
            >
              <div>
                <h3 className="font-display text-[24px] font-semibold tracking-tight text-fg md:text-[27px]">
                  {card.title}
                </h3>
                <ul className="mt-7 space-y-3 text-[15px] leading-snug text-fg-muted">
                  {card.bullets.map((bullet) => (
                    <li key={bullet} className="grid grid-cols-[14px_1fr] gap-2">
                      <span className="text-fg-muted">-</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                {'link' in card && card.link && (
                  <Link
                    href="#product"
                    className="mt-7 inline-flex items-center gap-1.5 text-[15px] font-medium text-blue-600"
                  >
                    {card.link}
                    <Icon name="arrow-right" size="xs" square={false} />
                  </Link>
                )}
              </div>
              <UseCaseVisual variant={card.visual} />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function UseCaseVisual({ variant }: { variant: (typeof USE_CASE_CARDS)[number]['visual'] }) {
  if (variant === 'plain') return null

  return (
    <div className="mt-auto pt-10">
      {variant === 'review' && <ReviewMockup />}
      {variant === 'thread' && <ThreadMockup />}
      {variant === 'release' && <ReleaseMockup />}
      {variant === 'compact' && <CompactOutcomeMockup />}
    </div>
  )
}

function ReviewMockup() {
  return (
    <div className="mockup-float -mx-7 -mb-7 overflow-hidden rounded-t-[12px] border-t border-[#d8d8d8] bg-white">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[10px] font-medium text-fg">
        <span className="grid size-5 place-items-center rounded bg-[#f5f5f7] text-[10px]">1</span>
        Shared utility:
        <span className="rounded border border-line bg-[#f5f5f7] px-2 py-0.5 font-mono">
          calls.ts
        </span>
        <span className="ml-auto text-fg-muted">0/1</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line text-[10px]">
        <div className="bg-white p-3">
          {['- old prompt', '- no fallback', '- manual tag', '+ new guardrail'].map((line, i) => (
            <p
              key={line}
              className={cn(
                'font-mono leading-6',
                i < 3 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600',
              )}
            >
              {line}
            </p>
          ))}
        </div>
        <div className="bg-white p-3">
          {['+ intent score', '+ handoff note', '+ webhook event', '+ audit log'].map((line) => (
            <p key={line} className="font-mono leading-6 text-emerald-600">
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

function ThreadMockup() {
  return (
    <div className="mockup-float -mx-1 overflow-hidden rounded-t-[12px] border border-[#d8d8d8] bg-white">
      <div className="h-6 bg-[#4a154b]" />
      <div className="space-y-4 p-5 text-[12px]">
        <p className="font-semibold text-fg">Thread <span className="font-normal text-fg-muted">#handoffs</span></p>
        <div className="flex gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded bg-[#f5f5f7]">S</span>
          <p><b>Sara</b> Customer asked for supervisor and refund timeline.</p>
        </div>
        <div className="flex gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded bg-fg text-white">L</span>
          <p><b>Livocall</b> Routed to support owner with transcript, sentiment, and next action.</p>
        </div>
      </div>
    </div>
  )
}

function ReleaseMockup() {
  return (
    <div className="mockup-float -mx-7 -mb-7 grid min-h-[190px] grid-cols-[0.9fr_1.1fr] overflow-hidden rounded-t-[12px] border-t border-[#d8d8d8] bg-white text-[10px]">
      <div className="border-r border-line p-4">
        <p className="font-semibold text-fg">Release Notes</p>
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-fg-muted">
          <li>Merge COD confirmation flow</li>
          <li>Add missed-call retry rules</li>
          <li>Update handoff notes</li>
        </ol>
      </div>
      <div className="p-4">
        <div className="rounded border border-line bg-[#0f172a] p-3 text-white">
          <p className="text-[9px] uppercase text-white/50">Program highlights</p>
          <div className="mt-3 h-16 rounded bg-white/10" />
        </div>
      </div>
    </div>
  )
}

function CompactOutcomeMockup() {
  return (
    <div className="mockup-float rounded-[12px] border border-[#d8d8d8] bg-white p-4">
      {[
        ['Confirmed', '87 calls', 'bg-emerald-500'],
        ['Needs retry', '14 calls', 'bg-amber-500'],
        ['Handoff', '6 calls', 'bg-blue-500'],
      ].map(([label, value, color]) => (
        <div key={label} className="flex items-center justify-between border-b border-line py-2 last:border-0">
          <span className="flex items-center gap-2 text-[12px] font-medium text-fg">
            <span className={cn('mockup-pulse size-2 rounded-full', color)} />
            {label}
          </span>
          <span className="text-[12px] text-fg-muted">{value}</span>
        </div>
      ))}
    </div>
  )
}

function IndustryPlaybooksSection() {
  return (
    <section id="playbooks" className="border-b border-line bg-[#f7f7f8]">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="landing-reveal max-w-3xl">
          <p className="text-[12px] font-semibold text-blue-600">Industry playbooks</p>
          <h2 className="mt-4 font-display text-[38px] font-semibold leading-[1.02] tracking-tight text-fg md:text-[58px]">
            Call flows shaped around the work your team already does.
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-fg-muted">
            Each playbook starts from a real trigger, gives the agent a focused job, and returns
            a clean business outcome your team can act on.
          </p>
        </div>

        <div className="landing-stagger mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {INDUSTRY_PLAYBOOKS.map((playbook) => (
            <article
              key={playbook.industry}
              className="landing-motion-card flex min-h-[560px] flex-col overflow-hidden rounded-[12px] border border-[#D2D4D6] bg-[#F5F5F7] p-7 md:min-h-[600px]"
            >
              <div className="flex items-start justify-between gap-4">
                <Icon name={playbook.icon} size="lg" square={false} className="text-fg" />
                <span className="rounded-full border border-[#D2D4D6] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                  Playbook
                </span>
              </div>

              <div className="relative z-10">
                <h3 className="mt-7 font-display text-[28px] font-semibold tracking-tight text-fg">
                  {playbook.industry}
                </h3>
                <ul className="mt-6 space-y-3 text-[13.5px] leading-snug text-fg-muted">
                  {[
                    ['Trigger', playbook.trigger],
                    ['Agent task', playbook.task],
                    ['Outcome', playbook.outcome],
                  ].map(([label, body]) => (
                    <li key={label} className="grid grid-cols-[76px_1fr] gap-3">
                      <span className="font-semibold text-fg">{label}</span>
                      <span>{body}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-faint">
                  Connects with
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {playbook.integrations.map((integration) => (
                    <span
                      key={integration}
                      className="rounded-full border border-[#D2D4D6] bg-white px-2.5 py-1 text-[11px] font-medium text-fg"
                    >
                      {integration}
                    </span>
                  ))}
                </div>
              </div>

              <PlaybookCreativeVisual industry={playbook.industry} />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function PlaybookCreativeVisual({ industry }: { industry: string }) {
  if (industry === 'E-commerce') {
    return (
      <div className="-mx-7 -mb-7 mt-auto h-[196px] overflow-hidden rounded-t-[12px] border-t border-[#D2D4D6] bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[12px] font-semibold text-fg">COD confirmation queue</span>
          <span className="rounded-full border border-[#D2D4D6] bg-[#F5F5F7] px-2 py-0.5 text-[10px] text-fg-muted">
            87 confirmed
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-4 p-4">
          <div className="space-y-2">
            {['Address matched', 'Quantity verified', 'Dispatch note sent'].map((item) => (
              <div
                key={item}
                className="mockup-glow-row rounded-[8px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2 text-[11px] text-fg"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="grid place-items-center rounded-[12px] border border-[#D2D4D6] bg-[#eff6ff] px-5">
            <span className="font-display text-[40px] font-semibold tracking-tight text-blue-600">87</span>
          </div>
        </div>
      </div>
    )
  }

  if (industry === 'Clinics') {
    return (
      <div className="-mx-7 -mb-7 mt-auto h-[196px] overflow-hidden rounded-t-[12px] border-t border-[#D2D4D6] bg-white p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-fg-muted">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
          {Array.from({ length: 14 }).map((_, index) => (
            <span
              key={index}
              className={cn(
                'grid aspect-square place-items-center rounded-[6px] bg-[#F5F5F7]',
                [3, 9].includes(index) && 'mockup-pulse bg-blue-600 text-white',
              )}
            >
              {index + 1}
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-[9px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2 text-[11px] text-fg">
          Tomorrow at 4:30 PM
        </div>
      </div>
    )
  }

  if (industry === 'Education') {
    return (
      <div className="-mx-7 -mb-7 mt-auto flex h-[196px] flex-col justify-center overflow-hidden rounded-t-[12px] border-t border-[#D2D4D6] bg-white p-5">
        {[
          ['Inquiry', '142', 'w-[84%]'],
          ['Qualified', '84', 'w-[62%]'],
          ['Counselor note', '31', 'w-[38%]'],
        ].map(([label, value, width]) => (
          <div key={label} className="mb-3 last:mb-0">
            <div className="flex justify-between text-[11px] text-fg-muted">
              <span>{label}</span>
              <span>{value}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-[#ECEDEF]">
              <div className={cn('mockup-bar h-full rounded-full bg-blue-600', width)} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (industry === 'Finance') {
    return (
      <div className="-mx-7 -mb-7 mt-auto h-[196px] overflow-hidden rounded-t-[12px] border-t border-[#D2D4D6] bg-white p-4">
        <div className="flex h-28 items-end gap-2">
          {[34, 58, 44, 76, 62, 88].map((height, index) => (
            <div
              key={index}
              className="mockup-bar flex-1 rounded-t-[6px] bg-blue-600"
              style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
          <span className="rounded-[8px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2 text-fg">Promise logged</span>
          <span className="rounded-[8px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2 text-fg">Audit note</span>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-7 -mb-7 mt-auto h-[196px] overflow-hidden rounded-t-[12px] border-t border-[#D2D4D6] bg-white p-4">
      <div className="relative h-full rounded-[12px] bg-[#F5F5F7]">
        <span className="absolute left-6 top-7 size-2.5 rounded-full bg-blue-600" />
        <span className="absolute right-8 top-10 size-2.5 rounded-full bg-blue-600" />
        <span className="absolute bottom-7 left-1/2 size-2.5 rounded-full bg-blue-600" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 128" aria-hidden="true">
          <path
            className="mockup-path"
            d="M36 34 C112 18 162 58 240 52 C280 50 292 86 170 104"
            fill="none"
            stroke="#2563eb"
            strokeDasharray="6 7"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  )
}

function ProofMetricsSection() {
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto max-w-screen-xl px-6 py-12">
        <div className="landing-stagger grid overflow-hidden rounded-[16px] border border-line bg-[#F5F5F7] md:grid-cols-4">
          {PROOF_METRICS.map(([value, label]) => (
            <div key={label} className="border-b border-line p-7 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <p className="font-display text-[42px] font-semibold leading-none tracking-tight text-fg">
                {value}
              </p>
              <p className="mt-3 text-[13px] font-medium uppercase tracking-[0.12em] text-fg-muted">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductSection() {
  return (
    <section id="product" className="border-b border-line bg-[#f7f7f8]">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="landing-reveal max-w-2xl">
          <p className="text-[12px] font-semibold text-blue-600">Voice operations</p>
          <h2 className="mt-4 max-w-2xl font-display text-[36px] font-semibold leading-[1.05] tracking-tight text-fg md:text-[48px]">
            The easy solution to multi-team calling
          </h2>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fg-muted">
            Livocall has the tools you need to onboard teams, assign workspaces, and manage
            revenue conversations without stitching together five different products.
          </p>
          <Link href="#playbooks" className="mt-7 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg">
            Explore platform features
            <Icon name="arrow-right" size="xs" square={false} />
          </Link>
        </div>

        <div className="landing-stagger mt-12 grid gap-3 lg:grid-cols-3">
          {PRODUCT_FEATURES.map((feature) => (
            <article key={feature.title} className="landing-motion-card min-h-[360px] rounded-[14px] border border-line bg-white p-7 shadow-card">
              <h3 className="text-[15px] font-semibold text-fg">{feature.title}</h3>
              <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">{feature.body}</p>
              <ProductVisual type={feature.visual} />
            </article>
          ))}
        </div>

        <div className="landing-reveal mt-24 grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
          <div>
            <p className="text-[12px] font-semibold text-blue-600">Billing</p>
            <h2 className="mt-4 font-display text-[34px] font-semibold leading-[1.05] tracking-tight text-fg md:text-[44px]">
              Subscription billing, without the headache
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-fg-muted">
              Add subscriptions to B2C or B2B workflows, unify usage data, and gate premium
              call automation behind the right plan.
            </p>
            <ul className="mt-6 space-y-3 text-[13px] text-fg-muted">
              {['Define and manage plans', 'Unify usage and billing data', 'Gate access to content'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Icon name="check" size="xs" square={false} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <BillingMockup />
        </div>
      </div>
    </section>
  )
}

function WorkflowSection() {
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="landing-reveal">
            <p className="text-[12px] font-semibold text-blue-600">Workflow</p>
            <h2 className="mt-4 font-display text-[38px] font-semibold leading-[1.02] tracking-tight text-fg md:text-[58px]">
              From raw calls to clean business outcomes.
            </h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-fg-muted">
              The page now gives buyers a clearer route through setup, launch, routing, and
              measurement without relying on decorative asset cards.
            </p>
          </div>

          <div className="landing-stagger grid gap-4">
            {WORKFLOW_STEPS.map((step, index) => (
              <article key={step.title} className="landing-motion-card grid gap-5 rounded-[16px] border border-line bg-[#F5F5F7] p-5 sm:grid-cols-[64px_1fr]">
                <div className="flex items-center gap-3 sm:block">
                  <span className="grid size-12 place-items-center rounded-full border border-[#D2D4D6] bg-white">
                    <Icon name={step.icon} size="md" square={false} />
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-muted sm:mt-4 sm:block">
                    Step {index + 1}
                  </span>
                </div>
                <div>
                  <h3 className="font-display text-[25px] font-semibold tracking-tight text-fg">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-fg-muted">
                    {step.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ProductVisual({ type }: { type: (typeof PRODUCT_FEATURES)[number]['visual'] }) {
  if (type === 'roles') {
    return (
      <div className="mt-12 grid place-items-center">
        <div className="grid grid-cols-3 gap-2">
          {['TA', 'AR', 'SH', 'QA', 'OP', 'FN', 'CS', 'AD', ''].map((label, i) => (
            <div
              key={`${label}-${i}`}
              className={cn(
                'tile-breathe grid size-16 place-items-center rounded-[8px] border border-line bg-[#f7f7f8] text-[12px] font-semibold text-fg-muted',
                label === 'AD' && 'border-[#D2D4D6] bg-white text-fg',
              )}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-2 text-[10px] text-fg-faint">
          {['Product Member', 'Administrator', 'Editor', 'QA Tester'].map((role, i) => (
            <span key={role} className={cn(i === 1 && 'font-semibold text-fg')}>{role}</span>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'routing') {
    return (
      <div className="mt-10 grid gap-3">
        <div className="mx-auto grid w-fit rounded-full border border-line bg-[#f7f7f8] px-3 py-1 text-[11px] text-fg">
          Auto route
        </div>
        <div className="rounded-[12px] border border-line bg-[#f7f7f8] p-5">
          {['Resolved by AI', 'Retry tomorrow', 'Human handoff'].map((item) => (
            <div key={item} className="mockup-glow-row flex items-center justify-between rounded-[8px] border border-transparent px-3 py-3 last:border-transparent">
              <span className="text-[13px] font-medium text-fg">{item}</span>
              <Icon name="arrow-right" size="xs" square={false} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-10 rounded-[12px] border border-dashed border-[#D2D4D6] p-6">
      <div className="mx-auto mb-4 w-fit rounded-full border border-line bg-white px-3 py-1 text-[11px] font-medium text-fg">
        Livocall
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="tile-breathe h-12 rounded-[7px] border border-line bg-white" />
        ))}
      </div>
    </div>
  )
}

function BillingMockup() {
  return (
    <div className="landing-motion-card overflow-hidden rounded-[16px] border border-line bg-white shadow-float">
      <div className="flex items-center justify-between border-b border-line px-5 py-3 text-[12px]">
        <span className="font-semibold text-fg">Acme, Inc.</span>
        <span className="text-fg-muted">Tailor made pricing</span>
      </div>
      <div className="grid gap-4 p-7 sm:grid-cols-2">
        {[
          ['Starter Plan', '৳9', ['Custom branding', 'Mobile app integration', 'Daily backups']],
          ['Pro Plan', '৳19', ['Everything in Starter', 'Unlimited projects', '24/7 priority support']],
        ].map(([plan, price, items]) => (
          <div key={plan as string} className="rounded-[10px] border border-line bg-[#f7f7f8] p-5">
            <p className="text-[12px] font-semibold text-fg">{plan}</p>
            <p className="mt-3 text-[28px] font-semibold text-fg">{price}<span className="text-[12px] text-fg-muted"> / month</span></p>
            <button className="mt-5 h-8 w-full rounded-full bg-fg text-[12px] font-medium text-white">
              Get started
            </button>
            <ul className="mt-5 space-y-2 text-[12px] text-fg-muted">
              {(items as string[]).map((item) => (
                <li key={item} className="flex gap-2">
                  <Icon name="check" size="xs" square={false} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function DarkPlatformSection() {
  return (
    <section className="bg-bg">
      <div className="relative bg-[#111114] py-24 text-white md:py-32 [clip-path:polygon(0_0,18%_0,21%_6%,79%_6%,82%_0,100%_0,100%_100%,82%_100%,79%_94%,21%_94%,18%_100%,0_100%)]">
        <div className="mx-auto grid max-w-screen-xl gap-14 px-6 md:grid-cols-2">
          <DarkPanel
            eyebrow="Frameworks"
            title="Build call automation for modern teams"
            body="Give every workflow a reusable structure: agents, knowledge, numbers, campaigns, handoffs, and analytics."
            cta="All frameworks"
          />
          <DarkPanel
            eyebrow="Integrations"
            title="Integrate with the tools you love"
            body="Use Livocall as the source of truth for call outcomes and sync with CRMs, Slack, webhooks, and billing."
            cta="All integrations"
          />
        </div>
      </div>
    </section>
  )
}

function DarkPanel({
  eyebrow,
  title,
  body,
  cta,
}: {
  eyebrow: string
  title: string
  body: string
  cta: string
}) {
  return (
    <div className="landing-reveal text-center">
      <p className="text-[12px] font-semibold text-cyan-300">{eyebrow}</p>
      <h2 className="mx-auto mt-5 max-w-md font-display text-[32px] font-semibold leading-[1.05] tracking-tight md:text-[42px]">
        {title}
      </h2>
      <p className="mx-auto mt-6 max-w-md text-[14px] leading-relaxed text-white/55">{body}</p>
      <Link href="#pricing" className="mt-8 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white">
        {cta}
        <Icon name="arrow-right" size="xs" square={false} />
      </Link>
      <div className="landing-stagger mt-14 grid grid-cols-3 border border-white/10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid h-28 place-items-center border border-white/10">
            <span className="tile-breathe h-7 w-20 rounded border border-white/25" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SecuritySection() {
  return (
    <section className="border-b border-line bg-[#f7f7f8]">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="landing-reveal grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="text-[12px] font-semibold text-blue-600">Trust controls</p>
            <h2 className="mt-4 max-w-2xl font-display text-[38px] font-semibold leading-[1.02] tracking-tight text-fg md:text-[56px]">
              Built for teams that need automation and accountability.
            </h2>
          </div>
          <p className="max-w-xl text-[15px] leading-relaxed text-fg-muted">
            Voice agents touch sensitive customer conversations. Livocall keeps controls,
            auditability, and operator review visible from the first workflow.
          </p>
        </div>

        <div className="landing-stagger mt-12 grid gap-4 md:grid-cols-3">
          {SECURITY_CARDS.map((card) => (
            <article key={card.title} className="landing-motion-card rounded-[16px] border border-line bg-white p-6">
              <Icon name={card.icon} size="lg" square />
              <h3 className="mt-6 font-display text-[25px] font-semibold tracking-tight text-fg">
                {card.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function TrustSection() {
  return (
    <section className="border-b border-line bg-[#f7f7f8]">
      <div className="mx-auto grid max-w-screen-xl gap-12 px-6 py-20 md:grid-cols-[0.75fr_1.25fr] md:py-28">
        <div className="landing-reveal">
          <h2 className="font-display text-[34px] font-semibold tracking-tight text-fg md:text-[44px]">
            Trusted around the world
          </h2>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-fg-muted">
            Join the teams using Livocall to automate high-volume phone conversations while
            keeping humans close to the moments that matter.
          </p>
          <Button asChild size="sm" className="mt-8 px-5">
            <Link href="/signup">Start building for free</Link>
          </Button>
        </div>
        <div className="landing-stagger grid gap-4 sm:grid-cols-2">
          {TESTIMONIALS.map((item) => (
            <article key={item.handle} className="landing-motion-card rounded-[12px] border border-line bg-white p-5 shadow-card">
              <p className="text-[13px] leading-relaxed text-fg">{item.quote}</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-[#f5f5f7] text-[12px] font-semibold text-fg">
                  {item.name.slice(0, 2)}
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-fg">{item.name}</p>
                  <p className="text-[11px] text-fg-muted">{item.handle}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function BuyerQuestionsSection() {
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto grid max-w-screen-xl gap-12 px-6 py-20 md:grid-cols-[0.75fr_1.25fr] md:py-28">
        <div className="landing-reveal">
          <p className="text-[12px] font-semibold text-blue-600">Questions</p>
          <h2 className="mt-4 font-display text-[38px] font-semibold leading-[1.02] tracking-tight text-fg md:text-[54px]">
            A few details buyers ask before launch.
          </h2>
        </div>

        <div className="landing-stagger divide-y divide-line rounded-[16px] border border-line bg-[#F5F5F7]">
          {FAQ_ITEMS.map(([question, answer]) => (
            <article key={question} className="grid gap-4 p-6 md:grid-cols-[0.8fr_1.2fr]">
              <h3 className="font-display text-[22px] font-semibold tracking-tight text-fg">
                {question}
              </h3>
              <p className="text-[14px] leading-relaxed text-fg-muted">{answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function LiveDemoSection() {
  return (
    <PublicWebcallDemo
      tags={DEMO_TAGS}
      configured
    />
  )
}
