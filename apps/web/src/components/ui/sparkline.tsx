import { cn } from '@/lib/cn'

export function Sparkline({
  values,
  width = 96,
  height = 28,
  className,
  positive = true,
}: {
  values: number[]
  width?: number
  height?: number
  className?: string
  positive?: boolean
}) {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const stepX = width / Math.max(1, values.length - 1)
  const pts = values
    .map((v, i) => `${i * stepX},${height - ((v - min) / span) * (height - 2) - 1}`)
    .join(' ')
  const lineColor = positive ? 'text-fg' : 'text-status-fail'
  const fillColor = positive ? 'fill-fg/15' : 'fill-status-fail/15'
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
        className={lineColor}
      />
      <polyline
        points={`0,${height} ${pts} ${width},${height}`}
        className={fillColor}
        stroke="none"
      />
    </svg>
  )
}
