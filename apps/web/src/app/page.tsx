import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Show, UserButton } from '@clerk/nextjs'
import type { ReactNode } from 'react'
import { LangSwitcher } from '@/components/lang-switcher'
import { MarketingFooter } from '@/components/marketing/footer'
import { FaqList } from '@/components/marketing/faq-list'
import { PricingTable } from '@/components/marketing/pricing-table'
import { Wordmark } from '@/components/wordmark'
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

const HERO_VIDEO_URL =
  'https://player.cloudinary.com/embed/?cloud_name=dfb3ym0jr&public_id=watermark_removed_4eb7bce2-4a4f-4a96-80fd-4680079b0524_oc3asn&autoplay=true&muted=true&loop=true&controls=false'

const FEATURE_ASSETS = [
  {
    asset: '/assets/landing/gloss-agent.png',
    title: 'AI agents',
    body: 'Launch Bangla and English voice agents for missed calls, order checks, and support.',
  },
  {
    asset: '/assets/landing/gloss-folder.png',
    title: 'Knowledge',
    body: 'Attach FAQs, policies, product docs, and workflow instructions to every call.',
  },
  {
    asset: '/assets/landing/gloss-handoff.png',
    title: 'Human handoff',
    body: 'Route complex buyers to the right team member with context already prepared.',
  },
  {
    asset: '/assets/landing/gloss-route.png',
    title: 'Call routing',
    body: 'Use numbers, campaigns, IVR keys, and escalation rules from one dashboard.',
  },
  {
    asset: '/assets/landing/gloss-shield.png',
    title: 'Guardrails',
    body: 'Keep DNC, opt-out, spend caps, roles, and audit trails close to the work.',
  },
  {
    asset: '/assets/landing/gloss-analytics.png',
    title: 'Revenue analytics',
    body: 'Track recovered revenue, confirmed orders, handoffs, and cost per outcome.',
  },
] as const

const PLAYBOOKS: Array<{
  icon: IconName
  title: string
  body: string
  stat: string
}> = [
  {
    icon: 'phone-call',
    title: 'Missed-call recovery',
    body: 'Call buyers back, answer common questions, qualify intent, and send hot leads to your team.',
    stat: '24/7 coverage',
  },
  {
    icon: 'shopping-bag',
    title: 'COD confirmation',
    body: 'Confirm address, quantity, delivery window, and order intent before dispatch.',
    stat: '87 confirmations',
  },
  {
    icon: 'wallet',
    title: 'Payment follow-up',
    body: 'Run polite reminders for invoices, subscriptions, EMIs, renewals, and retries.',
    stat: '42 reminders',
  },
]

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
      <FeatureAssets />
      <ProductSection />
      <PlaybooksSection />
      <PricingSection locale={locale} />
      <FaqSection locale={locale} />
      <FinalCta />
      <MarketingFooter locale={locale} />
    </main>
  )
}

function Hero({ locale }: { locale: Locale }) {
  return (
    <section className="relative isolate flex min-h-screen overflow-hidden border-b border-line">
      <div className="absolute inset-0 -z-20 overflow-hidden bg-bg">
        <iframe
          src={HERO_VIDEO_URL}
          title="LivoCall voice agent video"
          aria-hidden="true"
          tabIndex={-1}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          className="absolute left-1/2 top-1/2 h-[120vw] min-h-[120vh] w-[213.34vh] min-w-[120vw] -translate-x-1/2 -translate-y-1/2 border-0"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-white/70" />

      <div className="mx-auto flex w-full max-w-full flex-col overflow-hidden bg-transparent pb-32">
        <AnnouncementBar />
        <HomepageNav locale={locale} />

        <div className="relative flex flex-1 flex-col justify-center px-4 pb-7 pt-9 text-center sm:px-8 sm:pb-9 sm:pt-12 lg:px-12">
          <Link
            href="#features"
            className="relative z-10 mx-auto inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-white/80 px-2.5 py-1.5 text-[11px] text-fg-muted shadow-card backdrop-blur transition hover:border-fg/20 hover:text-fg"
          >
            <span className="rounded-full bg-fg px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-fg-inverse">
              New
            </span>
            <span className="truncate">AI agents, campaigns, handoffs, and analytics in one place.</span>
            <Icon name="arrow-right" size="xs" square={false} className="shrink-0" />
          </Link>

          <h1 className="relative z-10 mx-auto mt-6 max-w-4xl font-display text-[42px] font-medium leading-[0.95] tracking-tightest text-fg sm:text-[56px] lg:text-[72px]">
            The next-gen voice agent platform for revenue teams.
          </h1>
          <p className="relative z-10 mx-auto mt-5 max-w-2xl text-[14.5px] leading-relaxed text-fg-muted sm:text-[16px]">
            Livocall combines AI voice agents, Bangla-ready call flows, campaign automation,
            knowledge, and handoff controls in a single polished workspace.
          </p>

          <div className="relative z-10 mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-5">
              <Link href="/signup">
                Book a demo
                <Icon name="arrow-right" size="sm" square={false} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="rounded-full bg-white/80 px-5">
              <Link href="#product">
                <span className="grid size-6 place-items-center rounded-full border border-line bg-bg">
                  <Icon name="phone-call" size="xs" square={false} />
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

function AnnouncementBar() {
  return (
    <div className="relative flex items-center justify-center gap-3 border-b border-white/70 bg-white/62 px-3 py-2 text-[11px] text-fg-muted sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="rounded-full bg-fg px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-fg-inverse shrink-0">
          News
        </span>
        <span className="truncate">
          Livocall homepage now has generated frosted assets and glossy product icons.
        </span>
      </div>
      <Icon name="x" size="xs" square={false} className="absolute right-3 shrink-0 text-fg-faint sm:right-5" />
    </div>
  )
}

function HomepageNav({ locale }: { locale: Locale }) {
  return (
    <div className="z-50 px-4 py-4 sm:px-6 w-full flex justify-center">
      <header className="flex w-full max-w-5xl items-center justify-between gap-4 rounded-full border border-white/50 bg-white/40 px-3 py-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:px-5">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <span className="grid size-9 place-items-center rounded-full bg-fg text-fg-inverse shadow-sm transition-transform group-hover:scale-105">
            <Icon name="phone-call" size="sm" square={false} />
          </span>
          <span className="hidden sm:inline-block transition-opacity group-hover:opacity-80">
            <Wordmark />
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-fg-muted/90 transition-all hover:text-fg hover:drop-shadow-sm"
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
            <Button asChild size="sm" className="rounded-full px-5 shadow-sm transition-transform hover:scale-105">
              <Link href="/signup">Get Started</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Link href="/overview" className="hidden rounded-full bg-fg px-4 py-2 text-[13px] font-medium text-fg-inverse shadow-sm transition-transform hover:scale-105 sm:inline">
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

function FeatureAssets() {
  return (
    <section id="features" className="border-b border-line bg-bg">
      <div className="mx-auto max-w-screen-xl px-6 pb-16 pt-0 md:pb-20">
        <div className="grid gap-8 md:grid-cols-[0.85fr_1.15fr] md:items-end">
          <div>
            <SectionEyebrow>Generated assets</SectionEyebrow>
            <SectionTitle>Glossy product signals, rebuilt in the current palette.</SectionTitle>
          </div>
          <SectionLede>
            The homepage now uses the frosted hero artwork plus generated high-gloss 3D assets
            inspired by your reference, with electric blue glass and subtle green reflections.
          </SectionLede>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_ASSETS.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-[8px] border border-line bg-bg-subtle/50 p-5 transition hover:border-fg/20 hover:bg-bg hover:shadow-card-hover"
            >
              <div className="flex items-start gap-4">
                <Image
                  src={feature.asset}
                  alt=""
                  width={72}
                  height={72}
                  className="size-[72px] shrink-0 transition duration-300 group-hover:-translate-y-1"
                />
                <div>
                  <h3 className="font-display text-[20px] font-medium tracking-tighter text-fg">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{feature.body}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductSection() {
  return (
    <section className="border-b border-line bg-bg-subtle/45">
      <div className="mx-auto grid max-w-screen-xl gap-10 px-6 py-16 md:grid-cols-[0.95fr_1.05fr] md:items-center md:py-24">
        <div>
          <SectionEyebrow>Product workspace</SectionEyebrow>
          <SectionTitle>Everything the agent needs before, during, and after the call.</SectionTitle>
          <SectionLede>
            Build agents, attach knowledge, run outbound campaigns, capture outcomes, and keep
            operators ready for the calls that need a human touch.
          </SectionLede>
          <div className="mt-8 grid gap-3">
            {[
              ['bot', 'Agent builder', 'Prompt, voice, language, tools, knowledge, and runtime settings stay in one editor.'],
              ['phone-call', 'Live calling', 'Originate, monitor, and review calls with transcripts and outcomes tied to cost.'],
              ['shield-check', 'Operational control', 'Use roles, DNC, audit logs, secrets, and spend caps before scaling campaigns.'],
            ].map(([icon, title, body]) => (
              <div key={title} className="flex gap-3 rounded-[8px] border border-line bg-bg p-4">
                <Icon name={icon as IconName} size="lg" square />
                <div>
                  <h3 className="font-display text-[20px] font-medium tracking-tighter text-fg">{title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[28px] bg-[radial-gradient(circle_at_20%_15%,rgba(34,197,94,0.18),transparent_32%),radial-gradient(circle_at_80%_80%,rgba(10,10,10,0.1),transparent_34%)]"
          />
          <div className="overflow-hidden rounded-[14px] border border-line bg-bg shadow-float">
            <div className="border-b border-line bg-bg-subtle px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                Agent build quality
              </p>
              <h3 className="mt-1 font-display text-[24px] font-medium tracking-tighter text-fg">
                Ready for launch
              </h3>
            </div>
            <div className="grid gap-px bg-line sm:grid-cols-2">
              {[
                ['Knowledge coverage', '92%', 'status-live'],
                ['Prompt checks', '5/5', 'status-live'],
                ['Handoff rules', 'Active', 'status-live'],
                ['Spend cap', 'Protected', 'status-warn'],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-bg p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                    {label}
                  </p>
                  <p className="mt-2 font-display text-[32px] font-medium tracking-tightest text-fg">
                    {value}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        color === 'status-live' ? 'bg-status-live' : 'bg-status-warn',
                      )}
                    />
                    Checked continuously
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PlaybooksSection() {
  return (
    <section id="playbooks" className="border-b border-line bg-bg">
      <div className="mx-auto max-w-screen-xl px-6 py-16 md:py-24">
        <div className="max-w-3xl">
          <SectionEyebrow>Solutions</SectionEyebrow>
          <SectionTitle>Start from the call outcome, then let the platform handle the flow.</SectionTitle>
          <SectionLede>
            The new homepage is organized around the workflows a buyer understands: recover,
            confirm, remind, escalate, and measure.
          </SectionLede>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {PLAYBOOKS.map((item) => (
            <article key={item.title} className="rounded-[8px] border border-line bg-bg-subtle/50 p-5">
              <div className="flex items-center justify-between gap-3">
                <Icon name={item.icon} size="lg" square />
                <span className="rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">
                  {item.stat}
                </span>
              </div>
              <h3 className="mt-5 font-display text-[24px] font-medium tracking-tighter text-fg">
                {item.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection({ locale }: { locale: Locale }) {
  return (
    <section id="pricing" className="border-b border-line bg-bg-subtle/45">
      <div className="mx-auto max-w-screen-xl px-6 py-16 md:py-24">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <SectionTitle>Pay by call volume while tracking the business result.</SectionTitle>
        <SectionLede>
          Keep the billing story close to the product story: minutes, outcomes, recovered value,
          and the cost of every workflow.
        </SectionLede>
        <div className="mt-10">
          <PricingTable locale={locale} />
        </div>
      </div>
    </section>
  )
}

function FaqSection({ locale }: { locale: Locale }) {
  return (
    <section className="border-b border-line bg-bg">
      <div className="mx-auto grid max-w-screen-xl gap-10 px-6 py-16 md:grid-cols-[0.8fr_1.2fr] md:py-24">
        <div>
          <SectionEyebrow>Questions</SectionEyebrow>
          <SectionTitle>What business buyers ask before launch.</SectionTitle>
          <SectionLede>
            The answers stay focused on setup, guardrails, call quality, and proving ROI.
          </SectionLede>
        </div>
        <FaqList locale={locale} />
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="border-b border-line bg-bg">
      <div className="mx-auto flex max-w-screen-xl flex-col items-start gap-7 px-6 py-16 md:flex-row md:items-end md:justify-between md:py-24">
        <div>
          <SectionEyebrow>Ready when you are</SectionEyebrow>
          <h2 className="mt-4 max-w-3xl font-display text-[38px] font-medium leading-[1.02] tracking-tightest text-fg md:text-[58px]">
            Put AI voice agents on missed calls, COD orders, and payment follow-up.
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-full">
            <Link href="/signup">
              Start building
              <Icon name="arrow-right" size="sm" square={false} />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="rounded-full">
            <a href="mailto:hello@livocall.ai">Talk to a human</a>
          </Button>
        </div>
      </div>
    </section>
  )
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-faint">{children}</p>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-4 max-w-3xl font-display text-[34px] font-medium leading-[1.04] tracking-tightest text-fg md:text-[48px]">
      {children}
    </h2>
  )
}

function SectionLede({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{children}</p>
}
