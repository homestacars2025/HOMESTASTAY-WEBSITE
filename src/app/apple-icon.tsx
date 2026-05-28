import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#0E0E10',
          borderRadius: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Homesta arch mark scaled to fit the 180×180 canvas */}
        <svg width="112" height="112" viewBox="0 0 48 48">
          <path
            d="M9 42 L9 23 A15 15 0 0 1 39 23 L39 42"
            stroke="#E52851"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
