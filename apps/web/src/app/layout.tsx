import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { ClerkProvider, Show, UserButton } from '@clerk/nextjs'
import { getLocaleFromCookie, type Locale } from '@/lib/i18n'
import { clerkAppearance, clerkLocalization } from '@/lib/clerk-appearance'
import './globals.css'

const title = 'LivoCall - AI voice agents for Bangladesh'
const description =
  'Self-serve AI phone-call platform built for Bangladeshi businesses. Three engine tiers, local SIP trunks, billed in BDT - from BDT 0.85 a minute.'

export const metadata: Metadata = {
  title: { default: title, template: '%s | LivoCall' },
  description,
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  applicationName: 'LivoCall',
  manifest: '/manifest.webmanifest',
  keywords: [
    'AI voice agents',
    'Bangladesh',
    'BTRC compliant',
    'SIP trunk',
    'Bangla TTS',
    'Bangla STT',
    'Gemini Live',
    'Deepgram',
    'Cartesia',
    'FreeSWITCH',
  ],
  authors: [{ name: 'LivoCall' }],
  openGraph: {
    type: 'website',
    title,
    description,
    siteName: 'LivoCall',
    locale: 'en_US',
    // TODO(asset): see ASSETS.md hero.poster - add /og.png (1200x630)
    // images: [{ url: '/og.png', width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    // TODO(asset): see ASSETS.md hero.poster - add /og.png (1200x630)
    // images: ['/og.png'],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const locale: Locale = getLocaleFromCookie(cookieStore.get('livocall_locale')?.value)

  return (
    <html lang={locale}>
      <body className="bg-bg text-fg min-h-screen antialiased">
        <ClerkProvider
          signInUrl="/login"
          signUpUrl="/signup"
          signInForceRedirectUrl="/overview"
          signUpForceRedirectUrl="/overview"
          appearance={clerkAppearance}
          localization={clerkLocalization}
        >
          <header className="sr-only">
            <Show when="signed-in">
              <UserButton />
            </Show>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
