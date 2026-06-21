import { ImageResponse } from 'next/og'

export const alt = 'LivoCall — AI voice agents for Bangladesh'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, #18181b 0%, #09090b 70%, #050507 100%)',
          color: '#fafafa',
          fontFamily: 'ui-sans-serif, system-ui',
        }}
      >
        {/* hairline grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            opacity: 0.7,
            display: 'flex',
          }}
        />
        {/* top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 10,
              background: '#fafafa',
              color: '#09090b',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-0.06em',
            }}
          >
            bd
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '-0.03em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            bd
            <span style={{ color: '#71717a' }}>/</span>
            voice
          </div>
          <div
            style={{
              marginLeft: 'auto',
              fontSize: 14,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#a1a1aa',
              display: 'flex',
            }}
          >
            private preview
          </div>
        </div>

        {/* headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 600,
              letterSpacing: '-0.045em',
              lineHeight: 1.0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Phone calls,</span>
            <span style={{ color: '#a1a1aa' }}>on autopilot.</span>
          </div>
          <div style={{ fontSize: 26, color: '#d4d4d8', maxWidth: 880, lineHeight: 1.4, display: 'flex' }}>
            AI voice agents that speak Bangla and English natively, ride your local SIP
            trunk, and bill in BDT — from ৳0.85 a minute.
          </div>
        </div>

        {/* footer pill row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 18 }}>
          {[
            'Gemini Live',
            'Deepgram + Cartesia',
            'PJSIP',
            'BTRC-aware',
            '~80 ms RTT',
          ].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#e4e4e7',
                background: 'rgba(255,255,255,0.04)',
                display: 'flex',
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
