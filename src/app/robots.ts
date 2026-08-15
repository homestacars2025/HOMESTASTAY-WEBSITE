import type { MetadataRoute } from 'next';
import { CANONICAL_URL } from '@/lib/config/urls';

/**
 * robots.txt
 *
 * The site had none: /robots.txt returned a 404 page. That is not what was
 * blocking indexing — there is no noindex header or meta anywhere on public
 * pages, verified against production — but a crawler arriving at a 404 gets no
 * sitemap pointer and no crawl guidance at all.
 *
 * WHAT IS *NOT* DISALLOWED HERE, DELIBERATELY
 *   /book/*, /booking/*, /booking-failed already carry `robots: { index: false }`
 *   in their metadata. Adding a Disallow for them would be actively worse:
 *   Google must CRAWL a page to see its noindex, and a disallowed URL that
 *   someone links to can still end up indexed as a bare URL with no title. Meta
 *   noindex is the stronger instruction, so it is left to do its job alone.
 *
 * WHAT IS DISALLOWED
 *   Account and API surfaces that carry no noindex tag and have nothing to
 *   offer a search result. They are behind auth and would return a redirect or
 *   an empty shell to a crawler — pure crawl budget waste.
 *
 * The `/*\/` wildcards are needed because every public path is locale-prefixed
 * (localePrefix: 'always'), so the same page exists at /en/…, /ar/…, /tr/…
 * and /ru/….
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/*/my-bookings',
          '/*/sign-in',
          '/*/sign-up',
          '/*/verify-email',
        ],
      },
    ],
    sitemap: `${CANONICAL_URL}/sitemap.xml`,
    host: CANONICAL_URL,
  };
}
