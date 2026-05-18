import { cn } from '@/lib/cn'

export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src="https://res.cloudinary.com/dfb3ym0jr/image/upload/v1779089995/file_00000000f26c71fa9ffe8fb9cb675e19_wxjm8x.png"
      alt="Wordmark"
      className={cn('h-8 w-auto', className)}
    />
  )
}
