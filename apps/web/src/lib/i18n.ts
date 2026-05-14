export type Locale = 'en' | 'bn'

export const locales: Locale[] = ['en', 'bn']
export const defaultLocale: Locale = 'en'

type Dict = Record<string, string>

const en: Dict = {
  'brand.tagline': 'AI voice agents for Bangladeshi businesses',
  'nav.product': 'Product',
  'nav.pricing': 'Pricing',
  'nav.docs': 'Docs',
  'nav.signin': 'Sign in',
  'nav.start': 'Start free',
  'hero.eyebrow': 'Built for Bangladesh',
  'hero.title': 'Phone calls, automated.',
  'hero.subtitle':
    'Deploy Bangla and English voice agents for support, campaigns, reminders, and follow-up calls from ৳0.85 per minute.',
  'hero.cta.primary': 'Start a free trial',
  'hero.cta.secondary': 'Hear a demo call',
  'tiers.title': 'Three call types, one workspace',
  'tiers.subtitle':
    'Pick the call experience that matches the conversation. Mix support, campaign, and reminder flows in the same workspace.',
  'tier1.name': 'Retention support',
  'tier1.tag': 'Tier 1 · Save customers',
  'tier1.desc':
    'Answer complex questions, protect VIP customers, and hand off sensitive calls while they are live.',
  'tier1.price': 'from ৳7 / min',
  'tier2.name': 'Revenue campaigns',
  'tier2.tag': 'Tier 2 · Confirm and convert',
  'tier2.desc':
    'Confirm COD orders, qualify leads, recover abandoned interest, and keep follow-up consistent.',
  'tier2.price': 'from ৳6 / min',
  'tier3.name': 'Payment reminders',
  'tier3.tag': 'Tier 3 · Collect and remind',
  'tier3.desc':
    'Low-cost call flows for EMI, invoices, renewals, appointment reminders, and simple status updates.',
  'tier3.price': 'from ৳2 / min',
  'why.title': 'Why local matters',
  'why.latency.title': 'Singapore voice node',
  'why.latency.body':
    'Round-trip BD ↔ SG is ~80 ms. EU-hosted competitors land at 250 ms+ — you can hear it.',
  'why.bangla.title': 'Bangla, properly',
  'why.bangla.body':
    'Tuned prompts and an in-house dialect eval set covering Dhaka, Sylheti, and Chittagonian.',
  'why.compliance.title': 'BTRC-aware',
  'why.compliance.body':
    'DNC list, opt-out keywords, audible disclosure, and consent-recorded transcripts by default.',
  'cta.title': 'Bring your trunk. Bring your script. We handle the rest.',
  'footer.rights': 'All rights reserved.',
  'dashboard.greeting': 'Welcome back',
  'dashboard.subtitle': 'Your voice agents at a glance.',
  'side.overview': 'Overview',
  'side.agents': 'Agents',
  'side.calls': 'Calls',
  'side.numbers': 'Numbers',
  'side.knowledge': 'Knowledge',
  'side.campaigns': 'Campaigns',
  'side.dnc': 'Do-not-call',
  'side.developers': 'Developers',
  'side.connections': 'Connections',
  'side.billing': 'Billing',
  'side.settings': 'Settings',
  'side.signout': 'Sign out',
  // landing v2
  'hero.badge': 'Now in private preview',
  'tiers.cta': 'See all tier specs',
  'flow.title': 'How a call moves through the workflow',
  'flow.subtitle': 'From customer intent to answer, escalation, analytics, and follow-up.',
  'usecases.eyebrow': 'Built for',
  'usecases.title': 'Where LivoCall already pulls its weight',
  'compare.eyebrow': 'Why local',
  'compare.title': 'LivoCall vs scattered call tools',
  'compare.subtitle': 'The numbers that matter for a Bangladeshi caller — not a Silicon Valley pitch deck.',
  'social.eyebrow': 'In the wild',
  'social.title': 'Operators are quietly switching off voicemail',
  'faq.eyebrow': 'Questions',
  'faq.title': 'Frequently asked',
  'cta.kicker': 'Ready when you are',
  'cta.primary': 'Start a free trial',
  'cta.secondary': 'Talk to a human',
  'tier1.h1': 'Live support conversations',
  'tier1.h2': 'Native barge-in & interruption',
  'tier1.h3': 'Best for high-stakes conversations',
  'tier2.h1': 'Bangla outbound campaigns',
  'tier2.h2': 'Fast answer generation',
  'tier2.h3': 'Natural Bangla voice',
  'tier3.h1': 'Reusable voice prompts',
  'tier3.h2': 'Keypad response detection',
  'tier3.h3': 'Cheapest — ideal for surveys & OTP',
}

const bn: Dict = {
  'brand.tagline': 'বাংলাদেশি ব্যবসার জন্য এআই ভয়েস এজেন্ট',
  'nav.product': 'প্রোডাক্ট',
  'nav.pricing': 'মূল্য',
  'nav.docs': 'ডকুমেন্টেশন',
  'nav.signin': 'সাইন ইন',
  'nav.start': 'ফ্রি শুরু করুন',
  'hero.eyebrow': 'বাংলাদেশের জন্য তৈরি',
  'hero.title': 'ফোন কল এখন স্বয়ংক্রিয়।',
  'hero.subtitle':
    'Support, campaign, reminder ও follow-up call-এর জন্য বাংলা ও ইংরেজি voice agent চালান প্রতি মিনিট ৳০.৮৫ থেকে।',
  'hero.cta.primary': 'ফ্রি ট্রায়াল শুরু',
  'hero.cta.secondary': 'ডেমো কল শুনুন',
  'tiers.title': 'তিন ধরনের কল, একটি workspace',
  'tiers.subtitle':
    'কথোপকথনের সাথে মেলে এমন call experience বেছে নিন। একই workspace-এ support, campaign ও reminder flow চালান।',
  'tier1.name': 'Retention support',
  'tier1.tag': 'টিয়ার ১ · Customer retain',
  'tier1.desc':
    'Complex প্রশ্ন answer, VIP customer protect, এবং sensitive call live অবস্থায় handoff।',
  'tier1.price': 'প্রতি মিনিট ৳৭ থেকে',
  'tier2.name': 'Revenue campaigns',
  'tier2.tag': 'টিয়ার ২ · Confirm ও convert',
  'tier2.desc':
    'COD order confirm, lead qualify, abandoned interest recover এবং consistent follow-up।',
  'tier2.price': 'প্রতি মিনিট ৳৬ থেকে',
  'tier3.name': 'Payment reminders',
  'tier3.tag': 'টিয়ার ৩ · Collect ও remind',
  'tier3.desc':
    'EMI, invoice, renewal, appointment reminder ও simple status update-এর low-cost call flow।',
  'tier3.price': 'প্রতি মিনিট ৳২ থেকে',
  'why.title': 'লোকাল কেন গুরুত্বপূর্ণ',
  'why.latency.title': 'সিঙ্গাপুর ভয়েস নোড',
  'why.latency.body':
    'BD ↔ SG রাউন্ড-ট্রিপ ~৮০ মিলিসেকেন্ড। EU-হোস্টেড প্রতিদ্বন্দ্বীরা ২৫০ মিলিসেকেন্ডের বেশি — যা স্পষ্ট শোনা যায়।',
  'why.bangla.title': 'বাংলা, সঠিকভাবে',
  'why.bangla.body':
    'টিউনড প্রম্পট এবং ঢাকা, সিলেটি ও চাটগাঁইয়া উপভাষা কভার করা ইন-হাউস ইভ্যাল সেট।',
  'why.compliance.title': 'BTRC-সচেতন',
  'why.compliance.body':
    'ডিএনসি লিস্ট, অপ্ট-আউট কীওয়ার্ড, শ্রবণযোগ্য ডিসক্লোজার এবং কনসেন্ট-রেকর্ডেড ট্রান্সক্রিপ্ট ডিফল্টে।',
  'cta.title': 'আপনার ট্রাঙ্ক আনুন। আপনার স্ক্রিপ্ট আনুন। বাকিটা আমরা সামলাবো।',
  'footer.rights': 'সর্বস্বত্ব সংরক্ষিত।',
  'dashboard.greeting': 'স্বাগতম',
  'dashboard.subtitle': 'আপনার ভয়েস এজেন্টের সারাংশ।',
  'side.overview': 'ওভারভিউ',
  'side.agents': 'এজেন্ট',
  'side.calls': 'কল',
  'side.numbers': 'নাম্বার',
  'side.knowledge': 'নলেজ',
  'side.campaigns': 'ক্যাম্পেইন',
  'side.dnc': 'ডু-নট-কল',
  'side.developers': 'ডেভেলপার',
  'side.connections': 'কানেকশন',
  'side.billing': 'বিলিং',
  'side.settings': 'সেটিংস',
  'side.signout': 'সাইন আউট',
  'hero.badge': 'এখন প্রাইভেট প্রিভিউতে',
  'tiers.cta': 'সব টিয়ারের বিস্তারিত দেখুন',
  'flow.title': 'একটি কল কীভাবে প্ল্যাটফর্মে চলে',
  'flow.subtitle': 'গ্রাহকের ফোন থেকে এআই ইঞ্জিন এবং ফিরতি — ২০০ মিলিসেকেন্ডের কমে.',
  'usecases.eyebrow': 'যাদের জন্য',
  'usecases.title': 'যেখানে LivoCall এরিমধ্যেই কাজে লাগছে',
  'compare.eyebrow': 'লোকাল কেন',
  'compare.title': 'LivoCall vs অফশোর প্ল্যাটফর্ম',
  'compare.subtitle': 'একজন বাংলাদেশি কলারের জন্য যে সংখ্যাগুলো অর্থ রাখে — সিলিকন ভ্যালির পিচ-ডেক নয়.',
  'social.eyebrow': 'বাস্তব ব্যবহার',
  'social.title': 'অপারেটররা বোচারাভাবে ভয়সমেইল বন্ধ করছেন',
  'faq.eyebrow': 'প্রশ্ন',
  'faq.title': 'চলতি জিজ্ঞাসা',
  'cta.kicker': 'আপনি রেডি হলেই চলুন',
  'cta.primary': 'ফ্রি ট্রায়াল শুরু',
  'cta.secondary': 'একজন মানুষের সাথে কথা বলুন',
  'tier1.h1': 'লাইভ সাপোর্ট কথোপকথন',
  'tier1.h2': 'নেটিভ বার্জ-ইন এবং ইনটারাপশন',
  'tier1.h3': 'হাই-স্টেকস কথোপকথনের জন্য আদর্শ',
  'tier2.h1': 'বাংলা আউটবাউন্ড ক্যাম্পেইন',
  'tier2.h2': 'দ্রুত উত্তর তৈরি',
  'tier2.h3': 'ন্যাচারাল বাংলা ভয়েস',
  'tier3.h1': 'রিইউজেবল ভয়েস প্রম্পট',
  'tier3.h2': 'কীপ্যাড রেসপন্স ডিটেকশন',
  'tier3.h3': 'সর্বনিম্ন খরচ — সার্ভে ও OTP এর জন্য আদর্শ',
}

const dicts: Record<Locale, Dict> = { en, bn }

export function t(locale: Locale, key: string): string {
  return dicts[locale][key] ?? dicts.en[key] ?? key
}

export function getLocaleFromCookie(value: string | undefined): Locale {
  return value === 'bn' ? 'bn' : 'en'
}
