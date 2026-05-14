/**
 * Hand-rolled monogram + wordmark SVGs for the providers we integrate with.
 *
 * These are stylised marks (not the official trademarks) — kept deliberately
 * simple so they sit comfortably in the sky scheme. Each mark renders
 * at the same baseline height (20px) so the logo strip stays tidy.
 */

type MarkProps = { className?: string }

function Mono({
  glyph,
  label,
  className,
  glyphFont = 'serif',
}: {
  glyph: string
  label: string
  className?: string
  glyphFont?: 'serif' | 'sans' | 'mono'
}) {
  const family =
    glyphFont === 'serif'
      ? 'ui-serif, Georgia, "Times New Roman", serif'
      : glyphFont === 'mono'
        ? 'var(--font-mono)'
        : 'var(--font-display)'
  return (
    <svg
      viewBox="0 0 132 20"
      height="20"
      role="img"
      aria-label={label}
      className={className}
    >
      <g fill="currentColor">
        <text
          x="0"
          y="15"
          fontFamily={family}
          fontWeight="600"
          fontSize="13"
          letterSpacing="-0.4"
        >
          {glyph}
        </text>
        <text
          x={glyph.length * 7.6 + 6}
          y="15"
          fontFamily="var(--font-display)"
          fontWeight="500"
          fontSize="13"
          letterSpacing="-0.3"
        >
          {label}
        </text>
      </g>
    </svg>
  )
}

export function GeminiMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 100 20" height="20" role="img" aria-label="Gemini" className={className}>
      <g fill="currentColor">
        <path d="M10 3 L11.6 8.4 L17 10 L11.6 11.6 L10 17 L8.4 11.6 L3 10 L8.4 8.4 Z" />
        <text
          x="22"
          y="14.5"
          fontFamily="var(--font-display)"
          fontWeight="600"
          fontSize="13"
          letterSpacing="-0.4"
        >
          Gemini
        </text>
      </g>
    </svg>
  )
}

export function DeepgramMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 120 20" height="20" role="img" aria-label="Deepgram" className={className}>
      <g fill="currentColor">
        <path
          d="M3 4 H12 A6 6 0 0 1 12 16 H3 V4 Z M5.6 6.6 V13.4 H11.5 A3.4 3.4 0 0 0 11.5 6.6 Z"
          fillRule="evenodd"
        />
        <text
          x="22"
          y="14.5"
          fontFamily="var(--font-display)"
          fontWeight="600"
          fontSize="13"
          letterSpacing="-0.4"
        >
          Deepgram
        </text>
      </g>
    </svg>
  )
}

export function CartesiaMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 110 20" height="20" role="img" aria-label="Cartesia" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="10" cy="10" r="6" />
        <path d="M4 10 H16" />
        <path d="M10 4 V16" />
      </g>
      <text
        x="22"
        y="14.5"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontWeight="600"
        fontSize="13"
        letterSpacing="-0.4"
      >
        Cartesia
      </text>
    </svg>
  )
}

export function FreeSwitchMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 124 20" height="20" role="img" aria-label="FreeSWITCH" className={className}>
      <g fill="currentColor">
        <rect x="3" y="4" width="14" height="3.2" rx="1" />
        <rect x="3" y="8.4" width="10" height="3.2" rx="1" />
        <rect x="3" y="12.8" width="6" height="3.2" rx="1" />
      </g>
      <text
        x="22"
        y="14.5"
        fill="currentColor"
        fontFamily="var(--font-mono)"
        fontWeight="600"
        fontSize="12"
        letterSpacing="0"
      >
        FreeSWITCH
      </text>
    </svg>
  )
}

export function PipecatMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 110 20" height="20" role="img" aria-label="Pipecat" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M3 6 Q 9 16 15 6" />
        <path d="M5 12 Q 10 4 15 12" />
      </g>
      <text
        x="22"
        y="14.5"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontWeight="600"
        fontSize="13"
        letterSpacing="-0.4"
      >
        Pipecat
      </text>
    </svg>
  )
}

export function MongoDbMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 116 20" height="20" role="img" aria-label="MongoDB" className={className}>
      <g fill="currentColor">
        <path d="M10 2 C 6 6 6 12 10 18 C 14 12 14 6 10 2 Z" />
        <rect x="9.4" y="14" width="1.2" height="4" />
      </g>
      <text
        x="22"
        y="14.5"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontWeight="600"
        fontSize="13"
        letterSpacing="-0.4"
      >
        MongoDB
      </text>
    </svg>
  )
}

export function BkashMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 100 20" height="20" role="img" aria-label="bKash" className={className}>
      <g fill="currentColor">
        <circle cx="10" cy="10" r="6.4" />
        <text
          x="10"
          y="13.6"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight="700"
          fontSize="9"
          fill="#fff"
        >
          b
        </text>
      </g>
      <text
        x="22"
        y="14.5"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontWeight="600"
        fontSize="13"
        letterSpacing="-0.4"
      >
        bKash
      </text>
    </svg>
  )
}

export function NagadMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 100 20" height="20" role="img" aria-label="Nagad" className={className}>
      <g fill="currentColor">
        <path d="M3 16 V 4 L 17 16 V 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text
        x="22"
        y="14.5"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontWeight="600"
        fontSize="13"
        letterSpacing="-0.4"
      >
        Nagad
      </text>
    </svg>
  )
}

// `Mono` is exported in case other surfaces want to render a generic monogram.
export { Mono }
