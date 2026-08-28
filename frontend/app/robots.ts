import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Only the marketing page at "/" is meant to be found by search engines — the
// app itself is invite-gated / accountless-session based, not a public
// content surface. Per-route `robots: noindex` metadata already covers the
// meta-tag side; this covers crawl behavior for engines that check robots.txt
// before ever requesting a page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: '/api/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
