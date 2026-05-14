import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif'],
        bangla: ['var(--font-bangla)', 'var(--font-sans)'],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      colors: {
        // Editorial monochrome palette.
        ink: '#0a0a0a',
        paper: '#ffffff',
        bg: {
          DEFAULT: '#ffffff',
          subtle: '#fafaf9',
          muted: '#f5f5f4',
          inset: '#eeece8',
          inverse: '#0a0a0a',
        },
        fg: {
          DEFAULT: '#0a0a0a',
          strong: '#000000',
          muted: '#525252',
          subtle: '#737373',
          faint: '#a3a3a3',
          disabled: '#d4d4d4',
          inverse: '#fafafa',
        },
        line: {
          DEFAULT: '#e5e5e5',
          subtle: '#f0f0ef',
          strong: '#d4d4d4',
          inverse: '#262626',
        },
        accent: {
          DEFAULT: '#0a0a0a',
          hover: '#262626',
          soft: '#f5f5f4',
          ink: '#0a0a0a',
        },
        status: {
          live: '#22c55e',
          'live-soft': '#dcfce7',
          warn: '#f59e0b',
          'warn-soft': '#fef3c7',
          fail: '#ef4444',
          'fail-soft': '#fee2e2',
          info: '#0ea5e9',
          'info-soft': '#e0f2fe',
        },
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '14px',
        '3xl': '18px',
      },
      letterSpacing: {
        tightish: '-0.011em',
        tighter: '-0.02em',
        tightest: '-0.032em',
      },
      boxShadow: {
        // Restrained editorial shadows — mostly hairline rings.
        card: '0 0 0 1px rgba(10,10,10,0.06)',
        'card-hover': '0 4px 16px -8px rgba(10,10,10,0.14), 0 0 0 1px rgba(10,10,10,0.08)',
        pop: '0 8px 28px -12px rgba(10,10,10,0.18), 0 0 0 1px rgba(10,10,10,0.06)',
        float: '0 20px 48px -20px rgba(10,10,10,0.22), 0 0 0 1px rgba(10,10,10,0.06)',
        'inner-line': 'inset 0 0 0 1px rgba(10,10,10,0.06)',
        'ring-accent': '0 0 0 3px rgba(10,10,10,0.12)',
      },
      maxWidth: {
        prose: '68ch',
        'screen-xl': '1200px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        'wave-1': {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'wave-2': {
          '0%, 100%': { transform: 'scaleY(0.7)' },
          '50%': { transform: 'scaleY(0.3)' },
        },
        'wave-3': {
          '0%, 100%': { transform: 'scaleY(0.5)' },
          '50%': { transform: 'scaleY(1)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'caret-blink': {
          '0%, 50%, 100%': { opacity: '1' },
          '25%, 75%': { opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '200% 0%' },
        },
        'float-cloud': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease both',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'slide-up': 'slide-up 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        'wave-1': 'wave-1 1.0s ease-in-out infinite',
        'wave-2': 'wave-2 0.9s ease-in-out infinite',
        'wave-3': 'wave-3 1.1s ease-in-out infinite',
        marquee: 'marquee 30s linear infinite',
        'caret-blink': 'caret-blink 1s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'float-cloud': 'float-cloud 6s ease-in-out infinite',
      },
      backgroundImage: {
        'grid-mono':
          'linear-gradient(to right, rgba(10,10,10,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,10,10,0.04) 1px, transparent 1px)',
        'gradient-fade-bottom':
          'linear-gradient(to bottom, transparent 0%, #ffffff 100%)',
        'hero-landscape': "url('/hero-landscape.jpg')",
        'noise':
          "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
      },
    },
  },
  plugins: [],
}

export default config
