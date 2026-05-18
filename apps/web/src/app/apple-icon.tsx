import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <img
        src="https://res.cloudinary.com/dfb3ym0jr/image/upload/v1779084797/file_0000000019fc72079de24940c9d76d56_lki6kr.png"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        alt="Apple Icon"
      />
    ),
    { ...size },
  )
}

