import type { Metadata } from 'next';

import LandingPage from '../components/LandingPage';

const TITLE = 'Zenta — Free, Self-Hosted Remote Support & Screen Sharing';
const DESCRIPTION =
  'Give your computer a permanent ID and a password that rotates every 60 seconds. Full mouse-and-keyboard control, unattended access, and PBKDF2-hashed lockout protection — self-hosted, free, no per-seat licensing.';

// This is the one page in the app that should be publicly indexable — every
// other route stays noindex (set in layout.tsx) since the app itself is
// invite-gated / accountless-session based, not a public surface.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'remote support software',
    'screen sharing',
    'remote desktop',
    'self-hosted remote access',
    'unattended remote access',
    'UltraViewer alternative',
    'TeamViewer alternative',
    'AnyDesk alternative',
  ],
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    siteName: 'Zenta',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/opengraph-image'],
  },
};

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Zenta',
  applicationCategory: 'RemoteAccessApplication',
  operatingSystem: 'Windows (host) · Any modern browser (viewer)',
  description: DESCRIPTION,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export default function Home() {
  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <LandingPage />
    </>
  );
}
