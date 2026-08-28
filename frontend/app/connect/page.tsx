import type { Metadata } from 'next';

import ConnectHome from '../../components/ConnectHome';

export const dynamic = 'force-dynamic';

// The functional app screen — keep it out of search results even though the
// marketing page at "/" is now indexable.
export const metadata: Metadata = {
  title: 'Connect · Zenta',
  robots: { index: false, follow: false },
};

export default function ConnectPage() {
  return <ConnectHome />;
}
