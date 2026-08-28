import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  // Site-wide base so relative OG/twitter image URLs resolve correctly on
  // every route. Individual pages (see app/page.tsx) override title,
  // description and robots — the app itself stays noindex by default here;
  // only the marketing page at "/" opts back in.
  metadataBase: new URL(SITE_URL),
  title: 'Zenta',
  description: 'Private companion workspace',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
