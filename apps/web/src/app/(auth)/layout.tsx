import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandIcon } from '@/components/wordmark'
import { Icon } from '@/components/ui/icon'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-fg">
      <section className="flex min-h-screen w-full flex-col bg-white">
        <div className="flex h-10 items-center gap-1.5 border-b border-line px-5">
          <span className="size-2.5 rounded-full bg-[#ff6b57]" />
          <span className="size-2.5 rounded-full bg-[#f5c65b]" />
          <span className="size-2.5 rounded-full bg-[#70c47f]" />
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted transition hover:text-fg"
          >
            Home
            <Icon name="arrow-right" size="xs" square={false} />
          </Link>
        </div>

        <div className="grid flex-1 gap-0 lg:grid-cols-[1.04fr_0.96fr]">
          <ProductPanel />
          <div className="grid bg-white px-5 py-9 sm:px-8 sm:py-12 lg:min-h-[calc(100vh-40px)] lg:place-items-center lg:px-14">
            <div className="mx-auto w-full max-w-[360px]">
              {children}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function ProductPanel() {
  return (
    <section className="relative min-h-[470px] overflow-hidden bg-[#f7f7f8] px-5 py-8 sm:min-h-[540px] sm:px-8 sm:py-10 lg:min-h-0 lg:p-10">
      <div className="relative z-10 max-w-[440px] lg:pt-16">
        <p className="font-display text-[30px] font-semibold leading-[1.02] tracking-tight text-fg sm:text-[34px]">
          The first AI phone shop for every business call.
        </p>
        <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-fg-muted">
          Practical voice agents for sales, support, bookings, campaigns, and customer follow-up.
        </p>
      </div>

      <div className="relative z-10 mt-8 overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_24px_70px_rgba(20,20,20,0.09)] lg:absolute lg:bottom-[-26px] lg:left-10 lg:right-[-58px] lg:mt-0">
        <div className="grid min-h-[280px] grid-cols-[104px_1fr] text-[9px] sm:min-h-[340px] sm:grid-cols-[132px_1fr] sm:text-[10px] lg:min-h-[390px] lg:grid-cols-[150px_1fr] lg:text-[11px]">
          <aside className="relative border-r border-line bg-[#fbfbfb] p-3 sm:p-4">
            <div className="mb-5 flex items-center gap-2 sm:mb-7">
              <BrandIcon className="size-6 sm:size-7" />
              <span className="font-semibold text-fg">LivoCall</span>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              {['Overview', 'My calls', 'Campaigns', 'Analytics', 'Settings'].map((item, index) => (
                <div
                  key={item}
                  className={
                    index === 0
                      ? 'rounded-[8px] bg-fg px-2.5 py-2 font-semibold text-white sm:px-3'
                      : 'rounded-[8px] px-2.5 py-2 text-fg-muted sm:px-3'
                  }
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="absolute bottom-5 left-5 hidden w-[110px] rounded-[12px] border border-line bg-white p-3 text-center sm:block">
              <Icon name="phone-call" size="lg" square={false} className="mx-auto text-blue-600" />
              <p className="mt-2 text-[10px] font-semibold leading-tight text-fg">
                Upgrade for campaign calls
              </p>
            </div>
          </aside>

          <div className="p-4 sm:p-5 lg:p-6">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-fg sm:text-[15px]">Overview</p>
              <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[10px] text-fg-muted">
                Live queue
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-7 sm:gap-3 lg:gap-4">
              {[
                ['Total calls', '2.4k'],
                ['Orders placed', '184'],
                ['Unique customers', '926'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] bg-[#f5f5f7] p-2 sm:rounded-[10px] sm:p-3 lg:p-4">
                  <p className="text-fg-muted">{label}</p>
                  <p className="mt-2 font-display text-[18px] font-semibold tracking-tight text-fg sm:mt-3 sm:text-[22px] lg:text-[24px]">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-[0.9fr_1.1fr] gap-4 sm:mt-8 sm:gap-6">
              <div>
                <p className="font-semibold text-fg">Sales</p>
                <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-3">
                  {[70, 52, 84, 44].map((width, index) => (
                    <div key={index} className="h-2 rounded-full bg-[#f1f1f1]">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${width}%` }} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-semibold text-fg">Analytics</p>
                <div className="mt-4 flex h-16 items-end gap-1.5 sm:mt-5 sm:h-20 sm:gap-2 lg:h-24">
                  {[28, 52, 38, 76, 58, 88, 64].map((height, index) => (
                    <span
                      key={index}
                      className="w-full rounded-t-[6px] bg-[#ececec]"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 sm:mt-8 lg:mt-9">
              <p className="font-semibold text-fg">Recent activity</p>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:mt-4 sm:gap-3">
                {Array.from({ length: 16 }).map((_, index) => (
                  <span key={index} className="h-3 rounded-full bg-[#eeeeee]" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
