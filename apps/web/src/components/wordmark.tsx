import { cn } from '@/lib/cn'

export const BRAND_WORDMARK_URL =
  'https://user-cdn.hackclub-assets.com/019e5013-e846-7fc9-9532-7c8592ef92f9/IMG_20260522_201724.png'

export const BRAND_ICON_URL =
  'https://user-cdn.hackclub-assets.com/019e5013-e846-7fc9-9532-7c8592ef92f9/IMG_20260522_201724.png'

export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src={BRAND_WORDMARK_URL}
      alt="LivoCall"
      className={cn('h-9 w-auto object-contain', className)}
    />
  )
}

export function BrandIcon({ className }: { className?: string }) {
  return (
    <img
      src={BRAND_ICON_URL}
      alt="LivoCall"
      className={cn('size-9 object-contain', className)}
    />
  )
}
