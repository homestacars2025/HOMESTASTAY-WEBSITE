import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { routing } from '@/i18n/routing';
import { CANONICAL_URL } from '@/lib/config/urls';

/**
 * sitemap.xml — built from the live database, not a hand-kept list.
 *
 * The site had none (/sitemap.xml was a 404), which with no inbound links is
 * most of why Google has nothing indexed: there was no map to crawl.
 *
 * EVERY URL HERE IS LOCALE-PREFIXED. localePrefix is 'always', so
 * https://www.homestastay.com/stays 307-redirects to /en/stays. A sitemap or a
 * canonical pointing at the unprefixed form advertises a redirect as if it were
 * the destination — the exact defect being fixed on /stays in phase 2. Nothing
 * in this file may emit a bare path.
 *
 * hreflang lives in `alternates.languages` on each entry, which Next renders as
 * <xhtml:link rel="alternate" hreflang="…"> inside the <url> element.
 *
 * Read with the ANON client: everything in a sitemap is by definition public,
 * and the two views already apply their own visibility filters. The service
 * role has no business here.
 */

export const revalidate = 3600;

/** Google's hard limit is 50,000 URLs / 50 MB per sitemap file. */
const SITEMAP_MAX_URLS = 50_000;

const LOCALES = routing.locales;
const X_DEFAULT = routing.defaultLocale;

/**
 * Public, indexable static routes. Deliberately excludes the account and
 * transactional paths (they are noindexed or disallowed) and /blog posts,
 * which have no route of their own yet.
 */
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '',                    changeFrequency: 'daily',   priority: 1.0 },
  { path: '/stays',              changeFrequency: 'daily',   priority: 0.9 },
  { path: '/host',               changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact',            changeFrequency: 'monthly', priority: 0.5 },
  { path: '/blog',               changeFrequency: 'weekly',  priority: 0.5 },
  { path: '/terms',              changeFrequency: 'yearly',  priority: 0.2 },
  { path: '/privacy',            changeFrequency: 'yearly',  priority: 0.2 },
  { path: '/mesafeli-satis',     changeFrequency: 'yearly',  priority: 0.2 },
  { path: '/on-bilgilendirme',   changeFrequency: 'yearly',  priority: 0.2 },
];

/** Absolute, locale-prefixed. The ONE place a sitemap URL is built. */
function url(locale: string, path: string): string {
  return `${CANONICAL_URL}/${locale}${path}`;
}

/** hreflang map for a path that exists in every locale. */
function allLocaleAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = url(locale, path);
  languages['x-default'] = url(X_DEFAULT, path);
  return languages;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  // Static pages first: they must be present even if the database is
  // unreachable. A partial sitemap beats a 500 — a crawler that gets an error
  // learns nothing at all.
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.flatMap(
    ({ path, changeFrequency, priority }) =>
      LOCALES.map((locale) => ({
        url: url(locale, path),
        lastModified: new Date(),
        changeFrequency,
        priority,
        alternates: { languages: allLocaleAlternates(path) },
      })),
  );

  // ── City pages ────────────────────────────────────────────────────────────
  // v_sitemap_cities returns ONLY published city_content rows, one per
  // (city, language). Unpublished locales are deliberately absent: a fallback
  // page that lists units without editorial content is a fine page to reach by
  // link, but not one to push at Google as new content.
  const { data: cities, error: citiesError } = await supabase
    .from('v_sitemap_cities')
    .select('city_slug, language_code, updated_at');

  if (citiesError) {
    console.error('[sitemap] v_sitemap_cities failed — city pages omitted', {
      message: citiesError.message, code: citiesError.code,
    });
  } else {
    // Group first: a city's hreflang set must list its OTHER published
    // languages, which is only knowable once every row is in hand.
    const byCity = new Map<string, Array<{ locale: string; updatedAt: string | null }>>();
    for (const row of cities ?? []) {
      const slug = String(row.city_slug ?? '').trim().toLowerCase();
      const locale = String(row.language_code ?? '').trim();
      if (!slug || !LOCALES.includes(locale as typeof LOCALES[number])) continue;
      const list = byCity.get(slug) ?? [];
      list.push({ locale, updatedAt: (row.updated_at as string) ?? null });
      byCity.set(slug, list);
    }

    for (const [slug, published] of byCity) {
      const path = `/destinations/${slug}`;

      // Reciprocity: every alternate listed must itself be a page we are
      // publishing. Advertising a locale with no content breaks the hreflang
      // cluster and gets the whole set ignored.
      const languages: Record<string, string> = {};
      for (const { locale } of published) languages[locale] = url(locale, path);
      languages['x-default'] = languages[X_DEFAULT] ?? languages[published[0].locale];

      for (const { locale, updatedAt } of published) {
        entries.push({
          url: url(locale, path),
          lastModified: updatedAt ? new Date(updatedAt) : new Date(),
          changeFrequency: 'weekly',
          priority: 0.8,
          alternates: { languages },
        });
      }
    }
  }

  // ── Unit pages ────────────────────────────────────────────────────────────
  // v_sitemap_units already applies the public-visibility filter. Unit pages
  // exist in all four locales (unit_translations, with a Turkish fallback), so
  // every one gets the full hreflang set.
  const { data: units, error: unitsError } = await supabase
    .from('v_sitemap_units')
    .select('slug, updated_at');

  if (unitsError) {
    console.error('[sitemap] v_sitemap_units failed — unit pages omitted', {
      message: unitsError.message, code: unitsError.code,
    });
  } else {
    for (const row of units ?? []) {
      const slug = String(row.slug ?? '').trim();
      if (!slug) continue;
      const path = `/stays/${slug}`;
      const lastModified = row.updated_at ? new Date(row.updated_at as string) : new Date();

      for (const locale of LOCALES) {
        entries.push({
          url: url(locale, path),
          lastModified,
          changeFrequency: 'weekly',
          priority: 0.7,
          alternates: { languages: allLocaleAlternates(path) },
        });
      }
    }
  }

  // ── Size guard ────────────────────────────────────────────────────────────
  // At 159 units × 4 locales the file is nowhere near the ceiling, so splitting
  // now would be complexity bought for nothing. But silence at the limit is how
  // a sitemap starts dropping pages unnoticed, so this is loud.
  //
  // The migration when it fires: export generateSitemaps() returning chunk ids,
  // take `{ id }` here, and slice the unit list — Next then serves
  // /sitemap/0.xml, /sitemap/1.xml … behind a generated index automatically.
  if (entries.length > SITEMAP_MAX_URLS) {
    console.error(
      `[sitemap] ${entries.length} URLs exceeds the ${SITEMAP_MAX_URLS} limit. ` +
        'Google will ignore the overflow. Split with generateSitemaps() now.',
    );
  }

  return entries;
}
