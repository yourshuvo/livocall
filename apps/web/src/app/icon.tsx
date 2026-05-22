import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <img
        src="https://user-cdn.hackclub-assets.com/019e5013-e846-7fc9-9532-7c8592ef92f9/IMG_20260522_201724.png"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        alt="Icon"
      />
    ),
    size,
  )
}
