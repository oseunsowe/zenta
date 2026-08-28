import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background:
            'radial-gradient(1000px 600px at 85% -10%, rgba(109,108,255,0.35), transparent 60%), radial-gradient(800px 500px at -10% 110%, rgba(70,211,154,0.2), transparent 55%), linear-gradient(180deg, #0b1022, #07090f)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 40 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(circle at 30% 25%, #9a99ff, #6d6cff 55%, #3a3acf 100%)',
              color: '#fff',
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            Z
          </div>
          <div style={{ color: '#eef2fb', fontSize: 34, fontWeight: 700 }}>Zenta</div>
        </div>
        <div style={{ color: '#eef2fb', fontSize: 56, fontWeight: 800, lineHeight: 1.1, maxWidth: 920 }}>
          Remote support, without the subscription.
        </div>
        <div style={{ color: '#9aa3c2', fontSize: 28, marginTop: 26, maxWidth: 820 }}>
          Free, self-hosted screen sharing with real remote control and a password that rotates
          every 60 seconds.
        </div>
      </div>
    ),
    { ...size }
  );
}
