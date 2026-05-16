import { SignIn } from '@clerk/nextjs'

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
    <SignIn
      path="/login"
      routing="path"
      forceRedirectUrl={redirectUrl}
      signUpUrl="/signup"
    />
  )
}
