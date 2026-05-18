import { cn } from '@/lib/cn'

export const BRAND_WORDMARK_URL =
  'https://res.cloudinary.com/dfb3ym0jr/image/upload/v1779089995/file_00000000f26c71fa9ffe8fb9cb675e19_wxjm8x.png'

export const BRAND_ICON_URL =
  'https://res.cloudinary.com/dfb3ym0jr/image/upload/v1779084797/file_0000000019fc72079de24940c9d76d56_lki6kr.png'

export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src={BRAND_WORDMARK_URL}
      alt="LivoCall"
      className={cn('h-12 w-auto object-contain', className)}
    />
  )
}

export function BrandIcon({ className }: { className?: string }) {
  return (
    <img
      src={BRAND_ICON_URL}
      alt="LivoCall"
      className={cn('size-12 object-contain', className)}
    />
  )
}
