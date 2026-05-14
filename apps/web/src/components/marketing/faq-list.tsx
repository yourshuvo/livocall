'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icon'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/cn'

interface QA {
  q_en: string
  q_bn: string
  a_en: string
  a_bn: string
}

const QAS: QA[] = [
  {
    q_en: 'How fast can a business see value?',
    q_bn: 'ব্যবসা কত দ্রুত value দেখতে পারে?',
    a_en:
      'Start with one high-volume workflow such as missed-call callbacks, COD confirmation, or payment reminders. The dashboard then shows outcomes, cost, and handoffs.',
    a_bn:
      'Missed-call callback, COD confirmation বা payment reminder-এর মতো একটি high-volume workflow দিয়ে শুরু করুন। Dashboard outcome, cost ও handoff দেখায়।',
  },
  {
    q_en: 'Can it answer like our business, not a generic bot?',
    q_bn: 'এটা কি generic bot না হয়ে আমাদের business-এর মতো answer দেবে?',
    a_en:
      'Yes. Upload FAQs, policies, order rules, documents, URLs, and website content so calls follow your actual business rules.',
    a_bn:
      'হ্যাঁ। FAQ, policy, order rule, document, URL ও website content upload করুন যাতে call আপনার real business rule follow করে।',
  },
  {
    q_en: 'What outcomes can we track?',
    q_bn: 'কোন outcome track করা যাবে?',
    a_en:
      'Track confirmed orders, recovered payments, qualified leads, unanswered questions, escalations, campaign results, and cost per outcome.',
    a_bn:
      'Confirmed order, recovered payment, qualified lead, unanswered question, escalation, campaign result ও cost per outcome track করুন।',
  },
  {
    q_en: 'Will it replace our team?',
    q_bn: 'এটা কি আমাদের team replace করবে?',
    a_en:
      'No. It handles repetitive calls and routes angry, confused, or high-value customers to humans with context.',
    a_bn:
      'না। এটি repetitive call সামলায় এবং angry, confused বা high-value customer-কে context সহ মানুষের কাছে route করে।',
  },
  {
    q_en: 'How do we scale safely?',
    q_bn: 'নিরাপদে scale কীভাবে হবে?',
    a_en:
      'Use opt-out handling, privacy controls, role-based access, audit logs, and outcome analytics before increasing outbound volume.',
    a_bn: 'Outbound volume বাড়ানোর আগে opt-out, privacy control, role-based access, audit log ও outcome analytics ব্যবহার করুন।',
  },
]

export function FaqList({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState<number | null>(0)
  const bangla = locale === 'bn'
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg">
      {QAS.map((qa, i) => {
        const expanded = open === i
        return (
          <div key={i} className={cn(i !== 0 && 'border-t border-line')}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : i)}
              className="flex w-full items-center justify-between gap-6 px-5 py-4 text-left transition hover:bg-bg-subtle/50"
              aria-expanded={expanded}
            >
              <span
                className={cn(
                  'font-display text-[15.5px] font-medium tracking-tighter text-fg',
                  bangla && 'font-bangla',
                )}
              >
                {bangla ? qa.q_bn : qa.q_en}
              </span>
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border border-line bg-bg-subtle text-fg-muted transition',
                  expanded && 'rotate-45 bg-fg text-fg-inverse border-fg',
                )}
              >
                <Icon name="plus" size="sm" square={false} />
              </span>
            </button>
            {expanded && (
              <div
                className={cn(
                  'animate-fade-in px-5 pb-5 text-[13.5px] leading-relaxed text-fg-muted',
                  bangla && 'font-bangla',
                )}
              >
                {bangla ? qa.a_bn : qa.a_en}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
