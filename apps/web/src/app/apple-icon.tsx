import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          color: '#fafafa',
          fontFamily: 'ui-sans-serif, system-ui',
          fontWeight: 600,
          letterSpacing: '-0.04em',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 96,
            height: 96,
            borderRadius: 24,
            background: '#fafafa',
            color: '#09090b',
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: '-0.06em',
          }}
        >
          bd
        </div>
        <div style={{ marginTop: 14, fontSize: 22, opacity: 0.7 }}>·voice</div>
      </div>
    ),
    { ...size },
  )
}
