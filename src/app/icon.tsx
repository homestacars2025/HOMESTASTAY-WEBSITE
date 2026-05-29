import { ImageResponse } from 'next/og';

export const size        = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width:          512,
          height:         512,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        {/* Homesta arch mark — brand red #E52851, transparent background */}
        <svg width={420} height={420} viewBox="0 0 120 120">
          <path
            d="M22 100 L 22 60 A 38 38 0 0 1 98 60 L 98 100"
            stroke="#E52851"
            strokeWidth={14}
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
