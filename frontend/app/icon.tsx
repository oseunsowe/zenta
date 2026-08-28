import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 18,
          background: 'radial-gradient(circle at 30% 25%, #9a99ff, #6d6cff 55%, #3a3acf 100%)',
          color: '#fff',
          fontSize: 38,
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        Z
      </div>
    ),
    { ...size }
  );
}
