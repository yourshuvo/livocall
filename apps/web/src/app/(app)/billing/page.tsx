import Link from 'next/link'
import { TopBar } from '@/components/app/top-bar'
import { Card, CardBody, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'
import { Sparkline } from '@/components/ui/sparkline'
import { connectMongo, isMongoConfigured } from '@/lib/db'
import { getSession } from '@/lib/session'
import { Org, type OrgLean } from '@/models/Org'
import { getCapSnapshot, type CapSnapshot } from '@/lib/billing-caps'
import { fmtBdt } from '@/lib/format'
import { cn } from '@/lib/cn'
import { TopupButton } from './topup-client'

export const dynamic = 'force-dynamic'

const TIERS: { code: string; name: string; price: string; subline: string; perks: string[] }[] = [
  {
    code: 'T1',
    name: 'Conversational',
    price: 'Tk 7 / min',
    subline: 'Gemini Live - barge-in',
    perks: ['Real-time interruption', 'Bangla / English / mixed', 'Tool calls in conversation'],
  },
  {
    code: 'T2',
    name: 'Pipeline',
    price: 'Tk 6 / min',
    subline: 'Deepgram + Flash + Cartesia',
    perks: ['Lowest cost per minute', 'Streaming TTS', 'Structured outputs out-of-the-box'],
  },
  {
    code: 'T3',
    name: 'IVR',
    price: 'Tk 2 / min',
    subline: 'DTMF + cached TTS',
    perks: ['Pure menu / DTMF', 'Cheapest voice path', 'No GenAI cost'],
  },
]

const PAYMENTS: {
  icon?: IconName
  name: string
  status: 'live'
  note: string
}[] = [
  { icon: 'wallet', name: 'PayStation', status: 'live', note: 'hosted checkout · real BDT transactions' },
]

export default async function BillingPage() {
  const session = await getSession()
  const canAdmin = session.role === 'owner' || session.role === 'admin'
  let creditsPaisa = 0
  let plan = 'starter'
  let caps: CapSnapshot | null = null
  let loadError = ''
  if (isMongoConfigured()) {
    try {
      await connectMongo()
      const org = await Org.findById(session.orgId).lean<OrgLean>()
      if (org) {
        creditsPaisa = org.creditsPaisa
        plan = org.plan
        caps = await getCapSnapshot(
          String(org._id),
          org.dailySpendCapPaisa ?? 0,
          org.monthlySpendCapPaisa ?? 0,
        )
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Billing data failed to load'
    }
  }

  const balanceLow = creditsPaisa < 5_000_000 // < Tk 50k
  const spendSeries = caps ? [0, caps.spentTodayPaisa, caps.spentThisMonthPaisa] : [0, creditsPaisa]

  return (
    <>
      <TopBar
        title="Billing"
        searchPlaceholder="Search invoices, charges..."
        actions={
          <>
            <a
              href="/api/billing/ledger?format=csv"
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted"
            >
              <Icon name="book" size="xs" /> Ledger CSV
            </a>
            <TopupButton canAdmin={canAdmin} />
          </>
        }
      />

      <div className="flex-1 overflow-y-auto bg-bg">
      {loadError && (
        <div className="border-b border-status-fail/30 bg-status-fail/5 px-6 py-3 text-[13px] text-status-fail">
          Couldn’t load billing data: {loadError}
        </div>
      )}
      <div className="border-b border-line/70 px-6 py-5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-faint">Account</p>
        <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-fg">Billing</h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          Top up in BDT through PayStation hosted checkout. All conversation cost is metered to the paisa.
        </p>
      </div>

      {caps && (caps.dailyCapPaisa > 0 || caps.monthlyCapPaisa > 0) && (
        <div className="px-6 pt-6">
          <SpendCaps caps={caps} />
        </div>
      )}

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="relative overflow-hidden">
          <CardBody className="relative space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                  Workspace balance
                </p>
                <p className="mt-2 font-display text-[44px] font-medium leading-none tracking-tightest text-fg">
                  {fmtBdt(creditsPaisa)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {plan} plan
                  </Badge>
                  {balanceLow ? (
                    <Badge variant="warn">low balance - top up soon</Badge>
                  ) : (
                    <Badge variant="live">healthy</Badge>
                  )}
                </div>
              </div>
              <span className="grid size-12 place-items-center rounded-xl border border-line bg-bg-subtle text-fg shadow-card">
                <Icon name="currency" size="lg" />
              </span>
            </div>

            <div className="rounded-md border border-line bg-bg-subtle/60 p-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                  Workspace billing snapshot
                </p>
                <Sparkline values={spendSeries} positive />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-[12.5px]">
                <Stat label="Balance" value={fmtBdt(creditsPaisa)} sub="available" />
                <Stat label="Plan" value={plan} sub="workspace" />
                <Stat label="Caps" value={caps ? 'configured' : 'none'} sub="spend guard" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TopupButton canAdmin={canAdmin} defaultAmountTaka={50_000} />
              <Link
                href="/settings"
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg-muted hover:text-fg"
              >
                <Icon name="settings" size="xs" /> Auto-recharge
              </Link>
              <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg-faint">
                paisa-precise
              </span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <div className="border-b border-line p-5">
            <CardTitle>Payment methods</CardTitle>
            <CardDescription>
              PayStation is the active checkout gateway for workspace credit top-ups.
            </CardDescription>
          </div>
          <CardBody className="space-y-2.5">
            {PAYMENTS.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-3 rounded-md border border-line p-3 transition hover:border-fg/25"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-bg-subtle text-fg">
                  {p.icon ? <Icon name={p.icon} size="sm" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[13.5px] font-medium tracking-tighter text-fg">
                    {p.name}
                  </p>
                  <p className="text-[11.5px] text-fg-muted">{p.note}</p>
                </div>
                <Badge
                  variant="live"
                  className="capitalize"
                >
                  {p.status}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="px-8 pb-10">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              Pricing reference
            </p>
            <p className="mt-1 font-display text-[20px] font-medium tracking-tightest text-fg">
              Per-minute, all-inclusive
            </p>
          </div>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg-faint">
            SIP charges itemised on each call
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((t, i) => (
            <Card
              key={t.code}
              className={cn(
                'relative overflow-hidden',
                i === 1 && 'border-fg/30 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]',
              )}
            >
              <CardBody className="relative space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex rounded-full border border-line bg-bg-subtle px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg">
                      {t.code}
                    </span>
                    <p className="mt-2 font-display text-[18px] font-medium tracking-tighter text-fg">
                      {t.name}
                    </p>
                    <p className="text-[11.5px] text-fg-muted">{t.subline}</p>
                  </div>
                  <p className="font-display text-[22px] font-medium tracking-tightest text-fg">
                    {t.price}
                  </p>
                </div>
                <ul className="space-y-1.5 text-[12.5px] text-fg-muted">
                  {t.perks.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <Icon name="check" size="xs" className="mt-0.5 text-fg" />
                      {p}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
      </div>
    </>
  )
}

function SpendCaps({ caps }: { caps: CapSnapshot }) {
  return (
    <Card>
      <div className="border-b border-line p-5">
        <CardTitle>Spend caps</CardTitle>
        <CardDescription>
          Configured in <a href="/settings#workspace" className="underline">Workspace settings</a>.
          Reaching either cap blocks new outbound calls until the window resets.
        </CardDescription>
      </div>
      <CardBody className="grid gap-4 md:grid-cols-2">
        <CapBar
          label="Today"
          spent={caps.spentTodayPaisa}
          cap={caps.dailyCapPaisa}
          exceeded={caps.dailyExceeded}
          windowNote="UTC day - resets at 00:00 UTC"
        />
        <CapBar
          label="This month"
          spent={caps.spentThisMonthPaisa}
          cap={caps.monthlyCapPaisa}
          exceeded={caps.monthlyExceeded}
          windowNote="UTC month - resets on the 1st"
        />
      </CardBody>
    </Card>
  )
}

function CapBar({
  label,
  spent,
  cap,
  exceeded,
  windowNote,
}: {
  label: string
  spent: number
  cap: number
  exceeded: boolean
  windowNote: string
}) {
  if (cap === 0) {
    return (
      <div className="rounded-md border border-line p-4">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-medium text-fg">{label}</p>
          <Badge variant="outline">no cap</Badge>
        </div>
        <p className="mt-2 font-display text-[20px] font-medium tracking-tightest text-fg">
          {fmtBdt(spent)}
        </p>
        <p className="mt-0.5 text-[11px] text-fg-muted">{windowNote}</p>
      </div>
    )
  }
  const pct = Math.min(100, Math.round((spent / cap) * 100))
  const tone = exceeded ? 'fail' : pct >= 80 ? 'warn' : 'live'
  const barColor =
    tone === 'fail' ? 'bg-status-fail' : tone === 'warn' ? 'bg-status-warn' : 'bg-status-live'
  return (
    <div className="rounded-md border border-line p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-fg">{label}</p>
        <Badge variant={tone === 'fail' ? 'warn' : tone === 'warn' ? 'warn' : 'live'}>
          {exceeded ? 'cap reached' : `${pct}% of cap`}
        </Badge>
      </div>
      <p className="mt-2 font-display text-[20px] font-medium tracking-tightest text-fg">
        {fmtBdt(spent)} <span className="text-[12px] text-fg-muted">/ {fmtBdt(cap)}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div className={cn('h-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-fg-muted">{windowNote}</p>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-faint">{label}</p>
      <p className="mt-1 font-display text-[16px] font-medium tracking-tighter text-fg">{value}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-faint">{sub}</p>
    </div>
  )
}
