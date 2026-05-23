import { SignIn } from '@clerk/nextjs'
import { BrandIcon } from '@/components/wordmark'
import { clerkAuthPageAppearance } from '@/lib/clerk-appearance'

export const metadata = { title: 'Sign in - LivoCall' }

function safeRedirect(searchParams?: { redirect_url?: string | string[] }) {
  const value = Array.isArray(searchParams?.redirect_url)
    ? searchParams?.redirect_url[0]
    : searchParams?.redirect_url
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/overview'
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirect_url?: string | string[] }>
}) {
  const redirectUrl = safeRedirect(await searchParams)
  return (
    <div className="w-full max-w-[330px] text-center">
      <BrandIcon className="mx-auto size-14 sm:size-[70px]" />
      <h1 className="mt-6 text-[18px] font-semibold tracking-tight text-fg sm:mt-8">
        Welcome to LivoCall
      </h1>
      <p className="mt-3 text-[12px] font-medium text-fg-muted">Let&apos;s sign you in</p>

      <div className="mt-5 sm:mt-6">
        <SignIn
          path="/login"
          routing="path"
          forceRedirectUrl={redirectUrl}
          signUpUrl={`/signup?redirect_url=${encodeURIComponent(redirectUrl)}`}
          appearance={clerkAuthPageAppearance}
        />
      </div>
    </div>
  )
}
