import { BrandIcon } from '@/components/wordmark'

export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg">
      <div role="status" aria-label="Loading">
        <BrandIcon className="brand-loading-blink size-16" />
      </div>
    </div>
  )
}
