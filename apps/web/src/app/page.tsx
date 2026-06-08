import Link from 'next/link'
import { cookies } from 'next/headers'
import { Show, UserButton } from '@clerk/nextjs'
import type { ReactNode } from 'react'
import { LangSwitcher } from '@/components/lang-switcher'
import { MarketingFooter } from '@/components/marketing/footer'
import { PublicWebcallDemo } from '@/components/marketing/public-webcall-demo'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'
import { getLocaleFromCookie, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

const NAV_ITEMS = [
  { href: '#features', label: 'Use cases' },
  { href: '#playbooks', label: 'Industries' },
  { href: '#workflow', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
] as const

const TRUST_MARKS = ['E-commerce', 'Clinics', 'Education', 'Finance', 'Logistics']

const HERO_IMAGE_URL =
  'https://cdn.hackclub.com/019ea144-8633-7feb-9924-f88a8610d274/frosted-hero.png'
const HERO_MOBILE_IMAGE_URL =
  'https://user-cdn.hackclub-assets.com/019ea1a6-67d3-71f4-849e-1e3aacf43408/1780828220898.png'

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
      'Notify Slack, CRM, or the right team for follow-up',
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
      'Keep a clear history of every call flow change',
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
    title: 'Team access controls',
    body: 'Give sales, support, QA, and finance teams the right level of access to campaigns and call data.',
    visual: 'roles',
  },
  {
    title: 'Outcome routing',
    body: 'Send each call to the right next step: confirmed order, signup lead, retry, ticket, or human handoff.',
    visual: 'routing',
  },
  {
    title: 'Owner-friendly workspace',
    body: 'Track spend, results, team activity, recordings, and customer follow-ups from one clean console.',
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
    body: 'Confirm orders, retry unanswered contacts, notify your tools, or hand off complex conversations.',
  },
  {
    icon: 'bar-chart',
    title: 'Measure the result',
    body: 'Review revenue recovered, cost per outcome, transcript quality, and every human follow-up.',
  },
]

const DARK_PANELS = [
  {
    eyebrow: 'Signup workflows',
    title: 'Turn phone conversations into signed up customers',
    body: 'Capture interest, confirm details, collect the next step, and send a clean note to the person who owns the sale.',
    cta: 'Start signup',
    href: '/signup',
    logos: [
      {
        name: 'HubSpot',
        src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/hubspot.svg',
      },
      {
        name: 'Google Sheets',
        src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/googlesheets.svg',
      },
      { name: 'Slack', src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/slack.svg' },
      {
        name: 'Airtable',
        src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/airtable.svg',
      },
      { name: 'Meta', src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/meta.svg' },
      { name: 'Gmail', src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/gmail.svg' },
    ],
  },
  {
    eyebrow: 'Integrations',
    title: 'Connect Livocall with the tools your team already uses',
    body: 'Sync orders, signup leads, bookings, payment reminders, and handoff notes through n8n, WordPress, Shopify, WooCommerce, Zapier, or custom automations.',
    cta: 'Connect your stack',
    href: '/signup',
    logos: [
      { name: 'n8n', src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/n8n.svg' },
      {
        name: 'WordPress',
        src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/wordpress.svg',
      },
      {
        name: 'Shopify',
        src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/shopify.svg',
      },
      {
        name: 'WooCommerce',
        src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/woocommerce.svg',
      },
      { name: 'Zapier', src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/zapier.svg' },
      { name: 'Make', src: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/make.svg' },
    ],
  },
] as const

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
    integrations: ['Calendar', 'Sheets', 'SMS'],
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
    integrations: ['CRM', 'Sheets', 'Ledger'],
  },
  {
    icon: 'route',
    industry: 'Logistics',
    trigger: 'Delivery reschedules, failed delivery attempts, address checks, and rider callbacks.',
    task: 'Validate delivery instructions and send structured updates to operations.',
    outcome: 'Reduced failed attempts and faster exception resolution.',
    integrations: ['Dispatch', 'Sheets', 'CRM'],
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
    body: 'Use organization roles, member permissions, integration access, and billing visibility as your team grows.',
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
    'Yes. Connect through n8n, Zapier, WordPress, Shopify, WooCommerce, Google Sheets, Slack, HubSpot, or custom automations. For non-technical teams, we can help set up the first workflow.',
  ],
] as const

const KPI_ROWS = [
  { label: 'Recovered', value: '৳18.4k', tone: 'live' },
  { label: 'Orders', value: '87', tone: 'live' },
  { label: 'Handoffs', value: '6', tone: 'warn' },
]

const AI_PROVIDER_LOGOS = [
  { name: 'Gemini', src: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64' },
  { name: 'Grok', src: 'https://www.google.com/s2/favicons?domain=x.ai&sz=64' },
  { name: 'OpenAI', src: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64' },
  { name: 'Claude', src: 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=64' },
  { name: 'Cartesia', src: 'https://www.google.com/s2/favicons?domain=cartesia.ai&sz=64' },
  { name: 'ElevenLabs', src: 'https://www.google.com/s2/favicons?domain=elevenlabs.io&sz=64' },
]

export default async function LandingPage() {
  const cookieStore = await cookies()
  const locale: Locale = getLocaleFromCookie(cookieStore.get('livocall_locale')?.value)

  return (
    <main className="bg-bg text-fg min-h-screen">
      <HomepageNav locale={locale} />
      <Hero />
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

function Hero() {
  return (
    <section className="border-line relative isolate flex min-h-[100svh] overflow-hidden border-b sm:min-h-[calc(100svh-64px)]">
      <div className="bg-bg absolute inset-0 -z-20 overflow-hidden">
        <img
          src={HERO_MOBILE_IMAGE_URL}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover sm:hidden"
        />
        <img
          src={HERO_IMAGE_URL}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 hidden h-full w-full object-cover sm:block"
        />
      </div>

      <div className="mx-auto flex w-full max-w-full flex-col overflow-hidden bg-transparent pb-32">
        <div className="relative flex flex-1 flex-col justify-center px-4 pb-7 pt-9 text-center sm:px-8 sm:pb-9 sm:pt-12 lg:px-12">
          <Link
            href="/signup"
            className="announcement-animate hero-reveal text-fg relative z-10 mx-auto inline-flex max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-full border border-[#D2D4D6] bg-[#F5F5F7]/90 px-1.5 py-1 text-[11px] font-medium backdrop-blur-xl transition hover:bg-[#ECEDEF] sm:gap-2 sm:px-2.5 sm:py-1.5 sm:text-[13px]"
          >
            <span className="text-fg shrink-0 rounded-full border border-[#D2D4D6] bg-white px-1.5 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:text-[11px]">
              Business calls
            </span>
            <span className="truncate sm:hidden">Recover calls & signups automatically.</span>
            <span className="hidden truncate sm:inline">
              Recover missed calls, qualify signup leads, and confirm orders automatically.
            </span>
            <Icon name="arrow-right" size="xs" square={false} className="shrink-0" />
          </Link>

          <h1 className="hero-reveal hero-reveal-2 font-display tracking-tightest text-fg relative z-10 mx-auto mt-6 max-w-4xl text-[42px] font-medium leading-[0.95] sm:text-[56px] lg:text-[72px]">
            Turn missed calls and follow-ups into signed customers.
          </h1>
          <p className="hero-reveal hero-reveal-3 text-fg-muted relative z-10 mx-auto mt-5 max-w-2xl text-[14.5px] leading-relaxed sm:text-[16px]">
            Livocall gives Bangladeshi sales, support, and operations teams a phone agent that
            answers, qualifies, confirms, and hands off customer conversations without extra
            headcount.
          </p>

          <div className="hero-reveal hero-reveal-4 relative z-10 mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-5">
              <Link href="/signup">
                Start signup
                <Icon name="arrow-right" size="sm" square={false} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="rounded-full bg-white/80 px-5">
              <Link href="#live-demo">Try the voice demo</Link>
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
    <div className="fixed inset-x-0 top-0 z-[240] flex w-full justify-center bg-transparent px-3 py-2 sm:sticky sm:px-6 sm:py-4">
      <header className="homepage-nav-shell flex w-full min-w-0 max-w-5xl items-center justify-between gap-2 rounded-[22px] border border-black/5 bg-white/95 px-2.5 py-2 shadow-[0_12px_34px_rgb(15,23,42,0.10)] backdrop-blur-xl sm:gap-3 sm:px-3 md:rounded-full md:border-white/50 md:bg-white/45 md:px-5 md:shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <Link href="/" className="group inline-flex min-w-0 shrink items-center">
          <Wordmark className="h-5 max-w-[88px] transition-opacity group-hover:opacity-85 min-[380px]:max-w-[104px] sm:h-7 sm:max-w-[132px]" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-fg-muted/90 hover:text-fg text-[13px] font-medium transition-all"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
          <div className="hidden sm:block">
            <LangSwitcher locale={locale} />
          </div>
          <Show when="signed-out">
            <Link
              href="/login"
              className="text-fg-muted/90 hover:text-fg hidden px-2 text-[13px] font-medium transition-all sm:inline"
            >
              Sign in
            </Link>
            <Button
              asChild
              size="sm"
              className="rounded-full px-3 text-[12px] sm:px-5 sm:text-[13px]"
            >
              <Link href="/signup">
                <span className="sm:hidden">Signup</span>
                <span className="hidden sm:inline">Start signup</span>
              </Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Link
              href="/overview"
              className="text-fg hidden rounded-full border border-[#D2D4D6] bg-[#F5F5F7] px-4 py-2 text-[13px] font-medium transition hover:bg-[#ECEDEF] sm:inline"
            >
              Dashboard
            </Link>
            <UserButton />
          </Show>
          <details className="group relative md:hidden">
            <summary
              aria-label="Open menu"
              className="text-fg relative z-[280] flex size-8 cursor-pointer list-none items-center justify-center rounded-full transition duration-300 hover:bg-black/[0.04] group-open:bg-black/[0.05] [&::-webkit-details-marker]:hidden"
            >
              <span className="flex w-4 flex-col gap-1.5">
                <span className="h-0.5 w-full rounded-full bg-current transition duration-300 group-open:translate-y-1 group-open:rotate-45" />
                <span className="h-0.5 w-full rounded-full bg-current transition duration-300 group-open:-translate-y-1 group-open:-rotate-45" />
              </span>
            </summary>
            <div className="mobile-menu-backdrop fixed inset-0 z-[260] bg-black/10 backdrop-blur-[2px]" />
            <div className="mobile-menu-popover fixed inset-x-3 top-[58px] z-[270] rounded-[24px] border border-black/5 bg-white p-3 text-left shadow-[0_24px_70px_rgb(15,23,42,0.18)]">
              <div className="border-line bg-bg-subtle/70 rounded-[18px] border px-3 py-2">
                <p className="text-fg text-[13px] font-semibold">Navigate LivoCall</p>
              </div>

              <nav className="mt-3 grid grid-cols-2 gap-1.5">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-fg border-line bg-bg hover:border-fg/20 group flex items-center justify-between rounded-[15px] border px-3 py-2.5 text-[13px] font-semibold transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgb(15,23,42,0.10)]"
                  >
                    {item.label}
                    <Icon
                      name="arrow-right"
                      size="xs"
                      square={false}
                      className="text-fg-muted group-hover:text-fg transition duration-300 group-hover:translate-x-0.5"
                    />
                  </Link>
                ))}
              </nav>

              <div className="border-line mt-3 rounded-[18px] border bg-[#f7f7f8] p-2.5">
                <p className="text-fg text-[12px] font-semibold">AI + voice providers</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {AI_PROVIDER_LOGOS.map((logo) => (
                    <div
                      key={logo.name}
                      className="flex items-center gap-1.5 rounded-[13px] border border-white bg-white px-2 py-1.5 shadow-[0_8px_18px_rgb(15,23,42,0.05)]"
                    >
                      <span className="grid size-6 place-items-center rounded-full bg-[#f1f1f2]">
                        <img src={logo.src} alt="" className="size-4 object-contain" />
                      </span>
                      <span className="text-fg truncate text-[11.5px] font-medium">
                        {logo.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-1.5">
                <Show when="signed-out">
                  <Link
                    href="/signup"
                    className="bg-fg text-bg hover:bg-fg-muted flex h-10 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition duration-300 hover:-translate-y-0.5"
                  >
                    Start signup
                    <Icon name="arrow-right" size="xs" square={false} />
                  </Link>
                  <Link
                    href="/login"
                    className="text-fg-muted hover:text-fg flex h-9 items-center justify-center rounded-full text-[12.5px] font-medium transition hover:bg-black/[0.04]"
                  >
                    Sign in
                  </Link>
                </Show>
                <Show when="signed-in">
                  <Link
                    href="/overview"
                    className="bg-fg text-bg hover:bg-fg-muted flex h-10 items-center justify-center rounded-full text-[13px] font-semibold transition duration-300 hover:-translate-y-0.5"
                  >
                    Dashboard
                  </Link>
                </Show>
              </div>
            </div>
          </details>
        </div>
      </header>
    </div>
  )
}

function HeroConsole() {
  return (
    <div id="product-preview" className="relative mx-auto mt-9 w-full max-w-[820px]">
      <div className="border-line bg-bg/50 overflow-hidden rounded-[14px] border text-left backdrop-blur-md">
        <div className="border-line bg-bg-subtle/40 flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="bg-line-strong size-2.5 rounded-full" />
            <span className="bg-line-strong size-2.5 rounded-full" />
            <span className="bg-line-strong size-2.5 rounded-full" />
          </div>
          <div className="border-line bg-bg text-fg-faint hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] sm:flex">
            <span className="bg-status-live size-1.5 rounded-full" />4 calls live
          </div>
          <span className="text-fg-faint font-mono text-[10px] uppercase tracking-[0.12em]">
            agent console
          </span>
        </div>

        <div className="grid min-h-[310px] grid-cols-1 md:grid-cols-[152px_1fr] lg:grid-cols-[152px_1fr_190px]">
          <aside className="border-line bg-bg-subtle/50 hidden border-r p-3 md:block">
            <p className="text-fg-faint font-mono text-[9px] uppercase tracking-[0.14em]">
              Workspace
            </p>
            <p className="text-fg mt-1 truncate text-[12px] font-medium">ShopUp Express</p>
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
                    'mockup-side-button group relative flex items-center gap-2 overflow-hidden rounded-full border px-2.5 py-1.5 text-[11.5px] transition duration-300',
                    active
                      ? 'bg-bg text-fg border-white shadow-[0_10px_24px_rgb(15,23,42,0.08)]'
                      : 'text-fg-muted hover:border-line hover:bg-bg/70 hover:text-fg border-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'absolute inset-y-1 left-1 w-1 rounded-full transition duration-300',
                      active ? 'bg-status-live opacity-100' : 'bg-transparent opacity-0',
                    )}
                  />
                  <Icon
                    name={icon as IconName}
                    size="xs"
                    square={false}
                    className="relative z-10 transition duration-300 group-hover:scale-110"
                  />
                  <span className="relative z-10">{label}</span>
                </div>
              ))}
            </div>
          </aside>

          <div className="bg-bg min-w-0 p-3 sm:p-4">
            <div className="mb-3 grid grid-cols-3 gap-2">
              {KPI_ROWS.map((item) => (
                <div
                  key={item.label}
                  className="border-line bg-bg-subtle rounded-[7px] border px-2.5 py-2"
                >
                  <p className="text-fg-faint font-mono text-[8.5px] uppercase tracking-[0.12em]">
                    {item.label}
                  </p>
                  <p className="font-display text-fg mt-1 text-[17px] font-medium tracking-tighter">
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

            <div className="border-line bg-bg rounded-[8px] border">
              <div className="border-line flex items-center justify-between border-b px-3 py-2">
                <div>
                  <p className="text-fg text-[12px] font-medium">COD confirmation agent</p>
                  <p className="text-fg-muted text-[10px]">
                    Bangla voice, knowledge-backed, handoff ready
                  </p>
                </div>
                <span className="bg-status-live-soft text-status-live rounded-full px-2 py-0.5 text-[10px] font-medium">
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
                  I can collect that request and hand it to the dispatch team with this call
                  summary.
                </Message>
              </div>
            </div>
          </div>

          <aside className="border-line bg-bg-subtle/60 hidden border-l p-3 lg:block">
            <p className="text-fg-faint font-mono text-[9px] uppercase tracking-[0.14em]">
              Call intelligence
            </p>
            <div className="mt-3 space-y-2">
              {[
                ['Intent', 'Order confirmation'],
                ['Outcome', 'Confirmed'],
                ['Cost', '৳42'],
                ['Next step', 'Dispatch sync'],
              ].map(([label, value]) => (
                <div key={label} className="border-line bg-bg rounded-[7px] border px-2.5 py-2">
                  <p className="text-fg-faint font-mono text-[8.5px] uppercase tracking-[0.12em]">
                    {label}
                  </p>
                  <p className="text-fg mt-1 truncate text-[11.5px] font-medium">{value}</p>
                </div>
              ))}
            </div>
            <div className="border-line bg-bg mt-3 rounded-[7px] border px-2.5 py-2">
              <div className="text-fg flex items-center gap-1.5 text-[11.5px] font-medium">
                <Icon name="shield-check" size="xs" square={false} />
                Guardrails active
              </div>
              <p className="text-fg-muted mt-1 text-[10.5px] leading-relaxed">
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
          'shadow-card max-w-[78%] rounded-[8px] px-3 py-2 text-[11.5px] leading-relaxed',
          align === 'right' ? 'bg-fg text-fg-inverse' : 'border-line bg-bg-subtle text-fg border',
        )}
      >
        <p
          className={cn(
            'mb-1 font-mono text-[8px] uppercase tracking-[0.12em]',
            align === 'right' ? 'text-white/55' : 'text-fg-faint',
          )}
        >
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
      <p className="text-fg-faint text-center font-mono text-[10px] uppercase tracking-[0.16em]">
        Built for the call-heavy teams behind
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {TRUST_MARKS.map((mark) => (
          <span
            key={mark}
            className="border-line font-display text-fg-muted shadow-card rounded-full border bg-white/70 px-4 py-2 text-[14px] font-medium tracking-tighter backdrop-blur"
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
    <section id="features" className="border-line border-b bg-[#f7f7f8]">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="landing-reveal max-w-3xl">
          <h2 className="font-display text-fg text-[44px] font-semibold leading-[0.98] tracking-tight md:text-[72px]">
            Calls your team can stop doing manually
          </h2>
          <p className="text-fg mt-8 max-w-xl text-[18px] leading-relaxed">
            Use Livocall for the routine phone work that eats up sales and operations time:
            missed-call recovery, COD confirmation, reminders, and clean human handoffs.
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
                <h3 className="font-display text-fg text-[24px] font-semibold tracking-tight md:text-[27px]">
                  {card.title}
                </h3>
                <ul className="text-fg-muted mt-7 space-y-3 text-[15px] leading-snug">
                  {card.bullets.map((bullet) => (
                    <li key={bullet} className="grid grid-cols-[14px_1fr] gap-2">
                      <span className="text-fg-muted">-</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                {'link' in card && card.link && (
                  <Link
                    href="#playbooks"
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
      <div className="border-line text-fg flex items-center gap-2 border-b px-4 py-3 text-[10px] font-medium">
        <span className="grid size-5 place-items-center rounded bg-[#f5f5f7] text-[10px]">1</span>
        Missed-call recovery:
        <span className="border-line rounded border bg-[#f5f5f7] px-2 py-0.5 font-mono">
          follow-up queue
        </span>
        <span className="text-fg-muted ml-auto">live</span>
      </div>
      <div className="bg-line grid grid-cols-2 gap-px text-[10px]">
        <div className="bg-white p-3">
          {['- no answer', '- no owner', '- no notes', '+ qualified lead'].map((line, i) => (
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
          {['+ customer intent', '+ budget range', '+ preferred time', '+ owner assigned'].map(
            (line) => (
              <p key={line} className="font-mono leading-6 text-emerald-600">
                {line}
              </p>
            ),
          )}
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
        <p className="text-fg font-semibold">
          Thread <span className="text-fg-muted font-normal">#handoffs</span>
        </p>
        <div className="flex gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded bg-[#f5f5f7]">S</span>
          <p>
            <b>Sara</b> Customer asked for supervisor and refund timeline.
          </p>
        </div>
        <div className="flex gap-3">
          <span className="bg-fg grid size-8 shrink-0 place-items-center rounded text-white">
            L
          </span>
          <p>
            <b>Livocall</b> Routed to support owner with transcript, sentiment, and next action.
          </p>
        </div>
      </div>
    </div>
  )
}

function ReleaseMockup() {
  return (
    <div className="mockup-float -mx-7 -mb-7 grid min-h-[190px] grid-cols-[0.9fr_1.1fr] overflow-hidden rounded-t-[12px] border-t border-[#d8d8d8] bg-white text-[10px]">
      <div className="border-line border-r p-4">
        <p className="text-fg font-semibold">Campaign changes</p>
        <ol className="text-fg-muted mt-3 list-decimal space-y-2 pl-4">
          <li>Add payment reminder list</li>
          <li>Update missed-call retry rules</li>
          <li>Notify sales owner after signup</li>
        </ol>
      </div>
      <div className="p-4">
        <div className="border-line rounded border bg-[#0f172a] p-3 text-white">
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
        <div
          key={label}
          className="border-line flex items-center justify-between border-b py-2 last:border-0"
        >
          <span className="text-fg flex items-center gap-2 text-[12px] font-medium">
            <span className={cn('mockup-pulse size-2 rounded-full', color)} />
            {label}
          </span>
          <span className="text-fg-muted text-[12px]">{value}</span>
        </div>
      ))}
    </div>
  )
}

function IndustryPlaybooksSection() {
  return (
    <section id="playbooks" className="border-line border-b bg-[#f7f7f8]">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="landing-reveal max-w-3xl">
          <p className="text-[12px] font-semibold text-blue-600">Industry playbooks</p>
          <h2 className="font-display text-fg mt-4 text-[38px] font-semibold leading-[1.02] tracking-tight md:text-[58px]">
            Call flows shaped around the work your team already does.
          </h2>
          <p className="text-fg-muted mt-6 max-w-xl text-[15px] leading-relaxed">
            Each playbook starts from a real trigger, gives the agent a focused job, and returns a
            clean business outcome your team can act on.
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
                <span className="text-fg-muted rounded-full border border-[#D2D4D6] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Playbook
                </span>
              </div>

              <div className="relative z-10">
                <h3 className="font-display text-fg mt-7 text-[28px] font-semibold tracking-tight">
                  {playbook.industry}
                </h3>
                <ul className="text-fg-muted mt-6 space-y-3 text-[13.5px] leading-snug">
                  {[
                    ['Trigger', playbook.trigger],
                    ['Agent task', playbook.task],
                    ['Outcome', playbook.outcome],
                  ].map(([label, body]) => (
                    <li key={label} className="grid grid-cols-[76px_1fr] gap-3">
                      <span className="text-fg font-semibold">{label}</span>
                      <span>{body}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6">
                <p className="text-fg-faint font-mono text-[9px] uppercase tracking-[0.14em]">
                  Connects with
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {playbook.integrations.map((integration) => (
                    <span
                      key={integration}
                      className="text-fg rounded-full border border-[#D2D4D6] bg-white px-2.5 py-1 text-[11px] font-medium"
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
        <div className="border-line flex items-center justify-between border-b px-4 py-3">
          <span className="text-fg text-[12px] font-semibold">COD confirmation queue</span>
          <span className="text-fg-muted rounded-full border border-[#D2D4D6] bg-[#F5F5F7] px-2 py-0.5 text-[10px]">
            87 confirmed
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-4 p-4">
          <div className="space-y-2">
            {['Address matched', 'Quantity verified', 'Dispatch note sent'].map((item) => (
              <div
                key={item}
                className="mockup-glow-row text-fg rounded-[8px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2 text-[11px]"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="grid place-items-center rounded-[12px] border border-[#D2D4D6] bg-[#eff6ff] px-5">
            <span className="font-display text-[40px] font-semibold tracking-tight text-blue-600">
              87
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (industry === 'Clinics') {
    return (
      <div className="-mx-7 -mb-7 mt-auto h-[196px] overflow-hidden rounded-t-[12px] border-t border-[#D2D4D6] bg-white p-4">
        <div className="text-fg-muted grid grid-cols-7 gap-1 text-center text-[10px]">
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
        <div className="text-fg mt-4 rounded-[9px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2 text-[11px]">
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
            <div className="text-fg-muted flex justify-between text-[11px]">
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
          <span className="text-fg rounded-[8px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2">
            Promise logged
          </span>
          <span className="text-fg rounded-[8px] border border-[#D2D4D6] bg-[#F5F5F7] px-3 py-2">
            Audit note
          </span>
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
    <section className="border-line border-b bg-white">
      <div className="mx-auto max-w-screen-xl px-6 py-12">
        <div className="landing-stagger border-line grid overflow-hidden rounded-[16px] border bg-[#F5F5F7] md:grid-cols-4">
          {PROOF_METRICS.map(([value, label]) => (
            <div
              key={label}
              className="border-line border-b p-7 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <p className="font-display text-fg text-[42px] font-semibold leading-none tracking-tight">
                {value}
              </p>
              <p className="text-fg-muted mt-3 text-[13px] font-medium uppercase tracking-[0.12em]">
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
    <section id="pricing" className="border-line border-b bg-[#f7f7f8]">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="landing-reveal max-w-2xl">
          <p className="text-[12px] font-semibold text-blue-600">Business console</p>
          <h2 className="font-display text-fg mt-4 max-w-2xl text-[36px] font-semibold leading-[1.05] tracking-tight md:text-[48px]">
            One workspace for the people who own calls, sales, and follow-up.
          </h2>
          <p className="text-fg-muted mt-5 max-w-xl text-[15px] leading-relaxed">
            Give managers a simple place to launch call flows, review outcomes, control spend, and
            see which conversations became real business.
          </p>
          <Link
            href="#playbooks"
            className="text-fg mt-7 inline-flex items-center gap-1.5 text-[13px] font-semibold"
          >
            See business workflows
            <Icon name="arrow-right" size="xs" square={false} />
          </Link>
        </div>

        <div className="landing-stagger mt-12 grid gap-3 lg:grid-cols-3">
          {PRODUCT_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="landing-motion-card border-line shadow-card min-h-[360px] rounded-[14px] border bg-white p-7"
            >
              <h3 className="text-fg text-[15px] font-semibold">{feature.title}</h3>
              <p className="text-fg-muted mt-4 text-[13px] leading-relaxed">{feature.body}</p>
              <ProductVisual type={feature.visual} />
            </article>
          ))}
        </div>

        <div className="landing-reveal mt-24 grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
          <div>
            <p className="text-[12px] font-semibold text-blue-600">Pricing</p>
            <h2 className="font-display text-fg mt-4 text-[34px] font-semibold leading-[1.05] tracking-tight md:text-[44px]">
              Usage billing that business owners can understand
            </h2>
            <p className="text-fg-muted mt-5 text-[15px] leading-relaxed">
              Start with per-minute pricing, set spend caps, and track cost against confirmed
              orders, signup leads, callbacks, and handoffs.
            </p>
            <ul className="text-fg-muted mt-6 space-y-3 text-[13px]">
              {[
                'BDT-minute usage visibility',
                'Spend caps for every campaign',
                'Cost per signup, order, or handoff',
              ].map((item) => (
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
    <section id="workflow" className="border-line border-b bg-white">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="landing-reveal">
            <p className="text-[12px] font-semibold text-blue-600">Workflow</p>
            <h2 className="font-display text-fg mt-4 text-[38px] font-semibold leading-[1.02] tracking-tight md:text-[58px]">
              From raw calls to clean business outcomes.
            </h2>
            <p className="text-fg-muted mt-6 max-w-md text-[15px] leading-relaxed">
              Set the agent up with your business knowledge, launch a call flow, send each outcome
              to the right team, then measure the revenue or time saved.
            </p>
          </div>

          <div className="landing-stagger grid gap-4">
            {WORKFLOW_STEPS.map((step, index) => (
              <article
                key={step.title}
                className="landing-motion-card border-line grid gap-5 rounded-[16px] border bg-[#F5F5F7] p-5 sm:grid-cols-[64px_1fr]"
              >
                <div className="flex items-center gap-3 sm:block">
                  <span className="grid size-12 place-items-center rounded-full border border-[#D2D4D6] bg-white">
                    <Icon name={step.icon} size="md" square={false} />
                  </span>
                  <span className="text-fg-muted font-mono text-[11px] uppercase tracking-[0.16em] sm:mt-4 sm:block">
                    Step {index + 1}
                  </span>
                </div>
                <div>
                  <h3 className="font-display text-fg text-[25px] font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-fg-muted mt-3 max-w-2xl text-[14px] leading-relaxed">
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
                'tile-breathe border-line text-fg-muted grid size-16 place-items-center rounded-[8px] border bg-[#f7f7f8] text-[12px] font-semibold',
                label === 'AD' && 'text-fg border-[#D2D4D6] bg-white',
              )}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="text-fg-faint mt-5 flex gap-2 text-[10px]">
          {['Sales Rep', 'Administrator', 'Ops Lead', 'QA Reviewer'].map((role, i) => (
            <span key={role} className={cn(i === 1 && 'text-fg font-semibold')}>
              {role}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'routing') {
    return (
      <div className="mt-10 grid gap-3">
        <div className="border-line text-fg mx-auto grid w-fit rounded-full border bg-[#f7f7f8] px-3 py-1 text-[11px]">
          Auto route
        </div>
        <div className="border-line rounded-[12px] border bg-[#f7f7f8] p-5">
          {['Resolved by AI', 'Retry tomorrow', 'Human handoff'].map((item) => (
            <div
              key={item}
              className="mockup-glow-row flex items-center justify-between rounded-[8px] border border-transparent px-3 py-3 last:border-transparent"
            >
              <span className="text-fg text-[13px] font-medium">{item}</span>
              <Icon name="arrow-right" size="xs" square={false} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-10 rounded-[12px] border border-dashed border-[#D2D4D6] p-6">
      <div className="border-line text-fg mx-auto mb-4 w-fit rounded-full border bg-white px-3 py-1 text-[11px] font-medium">
        Livocall
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="tile-breathe border-line h-12 rounded-[7px] border bg-white" />
        ))}
      </div>
    </div>
  )
}

function BillingMockup() {
  return (
    <div className="landing-motion-card border-line shadow-float overflow-hidden rounded-[16px] border bg-white">
      <div className="border-line flex items-center justify-between border-b px-5 py-3 text-[12px]">
        <span className="text-fg font-semibold">LivoCall workspace</span>
        <span className="text-fg-muted">Pay for outcomes you can track</span>
      </div>
      <div className="grid gap-4 p-7 sm:grid-cols-2">
        {[
          [
            'Starter',
            '৳0.85',
            ['Per-minute call usage', 'Missed-call and COD workflows', 'Basic handoff notes'],
          ],
          [
            'Growth',
            'Custom',
            ['Higher call volume', 'Team access controls', 'Integration setup help'],
          ],
        ].map(([plan, price, items]) => (
          <div key={plan as string} className="border-line rounded-[10px] border bg-[#f7f7f8] p-5">
            <p className="text-fg text-[12px] font-semibold">{plan}</p>
            <p className="text-fg mt-3 text-[28px] font-semibold">
              {price}
              <span className="text-fg-muted text-[12px]">
                {' '}
                {price === 'Custom' ? '' : '/ min'}
              </span>
            </p>
            <button className="bg-fg mt-5 h-8 w-full rounded-full text-[12px] font-medium text-white">
              Start signup
            </button>
            <ul className="text-fg-muted mt-5 space-y-2 text-[12px]">
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
      <div className="relative bg-[#111114] py-24 text-white [clip-path:polygon(0_0,18%_0,21%_6%,79%_6%,82%_0,100%_0,100%_100%,82%_100%,79%_94%,21%_94%,18%_100%,0_100%)] md:py-32">
        <div className="mx-auto grid max-w-screen-xl gap-14 px-6 md:grid-cols-2">
          {DARK_PANELS.map((panel) => (
            <DarkPanel key={panel.eyebrow} {...panel} />
          ))}
        </div>
      </div>
    </section>
  )
}

function DarkPanel({ eyebrow, title, body, cta, href, logos }: (typeof DARK_PANELS)[number]) {
  return (
    <div className="landing-reveal text-center">
      <p className="text-[12px] font-semibold text-cyan-300">{eyebrow}</p>
      <h2 className="font-display mx-auto mt-5 max-w-md text-[32px] font-semibold leading-[1.05] tracking-tight md:text-[42px]">
        {title}
      </h2>
      <p className="mx-auto mt-6 max-w-md text-[14px] leading-relaxed text-white/55">{body}</p>
      <Link
        href={href}
        className="mt-8 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white"
      >
        {cta}
        <Icon name="arrow-right" size="xs" square={false} />
      </Link>
      <div className="landing-stagger mt-14 grid grid-cols-3 overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.03]">
        {logos.map((logo) => (
          <div
            key={logo.name}
            className="group grid h-28 place-items-center border border-white/10 p-4 transition hover:bg-white/[0.06]"
          >
            <div className="grid gap-3 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_12px_34px_rgb(0,0,0,0.18)] transition group-hover:scale-105">
                <img
                  src={logo.src}
                  alt={`${logo.name} logo`}
                  className="h-7 w-7 object-contain opacity-85 invert"
                  loading="lazy"
                />
              </span>
              <span className="text-[11px] font-medium text-white/60">{logo.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SecuritySection() {
  return (
    <section className="border-line border-b bg-[#f7f7f8]">
      <div className="mx-auto max-w-screen-xl px-6 py-20 md:py-28">
        <div className="landing-reveal grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="text-[12px] font-semibold text-blue-600">Trust controls</p>
            <h2 className="font-display text-fg mt-4 max-w-2xl text-[38px] font-semibold leading-[1.02] tracking-tight md:text-[56px]">
              Built for teams that need automation and accountability.
            </h2>
          </div>
          <p className="text-fg-muted max-w-xl text-[15px] leading-relaxed">
            Voice agents touch sensitive customer conversations. Livocall keeps controls,
            auditability, and operator review visible from the first workflow.
          </p>
        </div>

        <div className="landing-stagger mt-12 grid gap-4 md:grid-cols-3">
          {SECURITY_CARDS.map((card) => (
            <article
              key={card.title}
              className="landing-motion-card border-line rounded-[16px] border bg-white p-6"
            >
              <Icon name={card.icon} size="lg" square />
              <h3 className="font-display text-fg mt-6 text-[25px] font-semibold tracking-tight">
                {card.title}
              </h3>
              <p className="text-fg-muted mt-3 text-[14px] leading-relaxed">{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function TrustSection() {
  return (
    <section className="border-line border-b bg-[#f7f7f8]">
      <div className="mx-auto grid max-w-screen-xl gap-12 px-6 py-20 md:grid-cols-[0.75fr_1.25fr] md:py-28">
        <div className="landing-reveal">
          <h2 className="font-display text-fg text-[34px] font-semibold tracking-tight md:text-[44px]">
            Built for Bangladesh teams that depend on the phone
          </h2>
          <p className="text-fg-muted mt-5 max-w-sm text-[15px] leading-relaxed">
            Use Livocall to answer more customers, qualify more leads, and leave your team with the
            conversations that actually need a human.
          </p>
          <Button asChild size="sm" className="mt-8 px-5">
            <Link href="/signup">Start signup</Link>
          </Button>
        </div>
        <div className="landing-stagger grid gap-4 sm:grid-cols-2">
          {TESTIMONIALS.map((item) => (
            <article
              key={item.handle}
              className="landing-motion-card border-line shadow-card rounded-[12px] border bg-white p-5"
            >
              <p className="text-fg text-[13px] leading-relaxed">{item.quote}</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="text-fg grid size-9 place-items-center rounded-full bg-[#f5f5f7] text-[12px] font-semibold">
                  {item.name.slice(0, 2)}
                </span>
                <div>
                  <p className="text-fg text-[12px] font-semibold">{item.name}</p>
                  <p className="text-fg-muted text-[11px]">{item.handle}</p>
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
    <section className="border-line border-b bg-white">
      <div className="mx-auto grid max-w-screen-xl gap-12 px-6 py-20 md:grid-cols-[0.75fr_1.25fr] md:py-28">
        <div className="landing-reveal">
          <p className="text-[12px] font-semibold text-blue-600">Questions</p>
          <h2 className="font-display text-fg mt-4 text-[38px] font-semibold leading-[1.02] tracking-tight md:text-[54px]">
            A few details buyers ask before launch.
          </h2>
        </div>

        <div className="landing-stagger divide-line border-line divide-y rounded-[16px] border bg-[#F5F5F7]">
          {FAQ_ITEMS.map(([question, answer]) => (
            <article key={question} className="grid gap-4 p-6 md:grid-cols-[0.8fr_1.2fr]">
              <h3 className="font-display text-fg text-[22px] font-semibold tracking-tight">
                {question}
              </h3>
              <p className="text-fg-muted text-[14px] leading-relaxed">{answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function LiveDemoSection() {
  return <PublicWebcallDemo tags={DEMO_TAGS} configured />
}
