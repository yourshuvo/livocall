import { Icon } from '@/components/ui/icon'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

/**
 * Stylised, static "screenshot" of the dashboard. Built in pure markup so it
 * stays in sync with the rest of the design system — no bitmap to age.
 *
 * TODO(asset): see ASSETS.md → dashboardPreview.background — optional 1440×900
 * PNG export of the real /overview at apps/web/public/dashboard-preview.png.
 */
export function DashboardPreview({ locale }: { locale: Locale }) {
  const bangla = locale === 'bn'
  return (
    <div className="relative">
      <span className="absolute inset-0 cross-tl cross-tr cross-bl cross-br pointer-events-none" />
      <div className="overflow-hidden rounded-xl border border-line bg-bg shadow-pop">
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-line bg-bg-subtle/60 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1 font-mono text-[10px] text-fg-faint">
            <Icon name="globe" size="xs" />
            app.livocall.ai/overview
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            session · 14:02
          </span>
        </div>

        <div className="grid grid-cols-[145px_1fr]">
          <aside className="hidden border-r border-line bg-bg p-3 sm:block">
            <div className="mb-3 flex items-center gap-2">
              <img 
                src="https://res.cloudinary.com/dfb3ym0jr/image/upload/v1779089995/file_00000000f26c71fa9ffe8fb9cb675e19_wxjm8x.png" 
                alt="Brand Wordmark" 
                className="h-4 w-auto" 
              />
            </div>
            <div className="mb-3 rounded-md border border-line bg-bg-subtle px-2 py-1.5">
              <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-fg-faint">
                Workspace
              </p>
              <p className="text-[11px] font-medium text-fg">ShopUp Express</p>
            </div>
            <ul className="space-y-1 text-[11.5px]">
              {[
                { name: 'ROI', icon: 'dashboard', active: true },
                { name: 'Leads', icon: 'phone-call' },
                { name: 'Orders', icon: 'shopping-bag' },
                { name: 'Payments', icon: 'wallet' },
                { name: 'Handoffs', icon: 'headset' },
                { name: 'Insights', icon: 'bar-chart' },
                { name: 'Guardrails', icon: 'shield' },
              ].map((it) => (
                <li
                  key={it.name}
                  className={cn(
                    'flex items-center gap-2 rounded px-1.5 py-1',
                    it.active ? 'bg-bg-muted text-fg' : 'text-fg-muted',
                  )}
                >
                  <Icon name={it.icon as 'dashboard'} size="xs" />
                  <span>{it.name}</span>
                  {it.active && <span className="ml-auto size-1 rounded-full bg-fg" />}
                </li>
              ))}
            </ul>
          </aside>

          {/* main */}
          <div className="flex flex-col gap-3 bg-bg-subtle/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-faint">
                  Revenue overview
                </p>
                <p className={cn('font-display text-[15px] font-medium tracking-tighter text-fg', bangla && 'font-bangla')}>
                  {bangla ? 'হাই, তাসনিম' : 'Hi, Tasnim'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-status-live-soft px-2 py-0.5 text-[10px] font-medium text-status-live">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-status-live opacity-60 animate-pulse-ring" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-status-live" />
                </span>
                4 revenue calls live
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Recovered', value: '৳18.4k', delta: 'today' },
                { label: 'Orders confirmed', value: '87', delta: '31%' },
                { label: 'Cost / outcome', value: '৳42', delta: 'tracked' },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-line bg-bg p-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg-faint">
                    {s.label}
                  </p>
                  <p className="mt-1 font-display text-[15px] font-medium tracking-tighter text-fg">
                    {s.value}
                  </p>
                  <p className="font-mono text-[9px] text-status-live">↑ {s.delta}</p>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-line bg-bg">
              <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                <p className="text-[11px] font-medium text-fg">Today’s outcomes</p>
                <span className="font-mono text-[9px] text-fg-faint">business result</span>
              </div>
              <div className="divide-y divide-line">
                {[
                  { from: 'COD campaign', tier: 'T2', outcome: 'confirmed', dur: '2:14', cost: '৳2,450' },
                  { from: 'Lead callback', tier: 'T1', outcome: 'handoff', dur: '1:08', cost: 'hot lead' },
                  { from: 'Payment reminder', tier: 'T3', outcome: 'retry', dur: '0:18', cost: 'no answer' },
                  { from: 'Clinic reminder', tier: 'T3', outcome: 'booked', dur: '0:42', cost: 'slot saved' },
                ].map((row) => (
                  <div
                    key={row.from}
                    className="grid grid-cols-[1.6fr_0.5fr_0.9fr_0.6fr_0.8fr] items-center gap-2 px-3 py-1.5 text-[11px]"
                  >
                    <span className="font-mono text-fg">{row.from}</span>
                    <span className="rounded border border-line bg-bg-subtle px-1.5 py-0.5 text-center font-mono text-[9px] text-fg-muted">
                      {row.tier}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[10.5px]',
                        row.outcome === 'retry' ? 'text-status-warn' : 'text-status-live',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          row.outcome === 'retry' ? 'bg-status-warn' : 'bg-status-live',
                        )}
                      />
                      {row.outcome.replace('_', ' ')}
                    </span>
                    <span className="text-right font-mono text-fg-muted">{row.dur}</span>
                    <span className="text-right font-mono text-fg">{row.cost}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* footer / live status */}
        <div className="flex items-center justify-between border-t border-line bg-bg-subtle/60 px-3 py-1.5">
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-fg-muted">
            <span className="size-1.5 rounded-full bg-status-live" /> outcomes, handoffs, guardrails online
          </span>
          <span className="font-mono text-[10px] text-fg-faint">87 confirmed · 6 handoffs</span>
        </div>
      </div>

      {/* Floating spec chip */}
      <div className="absolute -left-3 -top-3 hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted shadow-card sm:inline-flex">
        <span className="size-1 rounded-full bg-fg" /> ROI · live
      </div>
    </div>
  )
}
