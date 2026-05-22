import { BrandIcon } from '@/components/wordmark'

export default function AppLoading() {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-bg">
      <div role="status" aria-label="Loading">
        <BrandIcon className="brand-loading-blink size-16" />
      </div>
    </div>
  )
}
