import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { canonical } from '@/lib/config/urls';
import { JsonLd } from '@/components/seo/JsonLd';
import { graph, breadcrumbSchema, faqSchema, itemListSchema } from '@/lib/seo/schema';
import {
  SITE_NAME, ogLocale, ogAlternateLocales, ogImage,
  OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT,
} from '@/lib/config/seo';
import type { Locale } from '@/i18n/routing';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { StaysGallery } from '@/components/stays/StaysGallery';
import { CityBody } from '@/components/destinations/CityBody';
import { CityFaq } from '@/components/destinations/CityFaq';
import { CityStatsBar } from '@/components/destinations/CityStatsBar';
import { FadeUp } from '@/components/motion/FadeUp';
import { Link } from '@/i18n/navigation';
import { resolveDestination } from '@/lib/queries/destinations';
import { localizedCityName } from '@/lib/geo/city-name';
import { getPublicUnits } from '@/lib/queries/stays';

/**
 * /[locale]/destinations/[city] — the city landing page.
 *
 * WHY THIS ROUTE EXISTS AT ALL
 *   sitemap.xml has been advertising /destinations/{slug} to Google since the
 *   SEO layer landed, and every one of those URLs returned 404 because the
 *   route was never built. Cities were reachable only as /stays?city=…, which
 *   canonicalises to /stays — so the site had, in effect, zero indexable city
 *   pages while telling Google it had some. This closes both halves of that.
 *
 * WHY NOT /stays/[city]
 *   /stays/[slug] is the unit detail route. A city segment there would collide
 *   with every unit slug and make "is this a city or a unit?" a runtime guess.
 *
 * WHY NOT ?city=
 *   A query parameter on /stays is a filtered view of the index, not a page.
 *   /stays already canonicalises every permutation back to itself, on purpose.
 *
 * Server-rendered throughout: the h1, the intro, the body prose and the FAQ are
 * all in the HTML that arrives, not injected afterwards. That is the whole
 * point — an AI crawler that does not execute JavaScript must still read the
 * complete page.
 */

// Not force-dynamic, unlike its siblings. In practice next-intl reads headers()
// to resolve the locale, so the ROUTE still renders per request — the build
// output marks it ƒ. What this buys is the layer underneath: the city stats and
// editorial copy come from unstable_cache (see queries/destinations), so a
// render costs no database round trip inside the window, and /api/revalidate's
// 'units' tag still drops the stats the moment inventory changes.
export const revalidate = 600;

type Props = {
  params: Promise<{ locale: string; city: string }>;
};

/**
 * HREFLANG HERE IS NOT THE FULL FOUR-LOCALE SET, DELIBERATELY.
 *
 * Google ignores an hreflang cluster that is not reciprocal: every page in the
 * set must list every other, ITSELF INCLUDED. A destination has editorial
 * content in some locales and renders a units-only fallback in the rest, and
 * sitemap.xml already lists only the published ones (v_sitemap_cities filters
 * on status='published'). So:
 *
 *   locale IS published  → emit the published set, which contains this page.
 *                          Reciprocal, and identical to what the sitemap says.
 *   locale is NOT published → emit no languages at all. Listing en+ar from a
 *                          Turkish fallback page would name a cluster this page
 *                          is not a member of, which invalidates the whole set
 *                          for every page in it.
 *
 * The fallback page keeps its self-canonical and stays indexable on its own
 * merits — it just is not part of a translation cluster until its copy ships.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, city } = await params;
  const destination = await resolveDestination(city, locale);
  if (!destination) return {};

  const [t, cityName] = await Promise.all([
    getTranslations({ locale, namespace: 'pages.destinations' }),
    localizedCityName(destination.stats.cityName, locale),
  ]);
  const { content, publishedLocales, slug, imageUrl } = destination;

  const path = `/destinations/${slug}`;
  const canonicalUrl = canonical(locale, path);
  const title = content?.metaTitle ?? t('metaTitleFallback', { city: cityName });
  const description =
    content?.metaDescription ?? t('metaDescriptionFallback', { city: cityName });

  // Reciprocity — see the block comment above.
  let languages: Record<string, string> | undefined;
  if (publishedLocales.includes(locale as Locale)) {
    languages = {};
    for (const published of publishedLocales) {
      languages[published] = canonical(published, path);
    }
    // x-default prefers English, but must still name a page in the set — a city
    // published only in Arabic points x-default at the Arabic page.
    languages['x-default'] = languages.en ?? languages[publishedLocales[0]];
  }

  // A city with neither editorial copy NOR a single available unit is a real
  // page (the homepage strip links to it, and it must not 404) but it has
  // nothing to rank for. Letting Google index it would add thin pages to the
  // very site we are trying to get taken seriously. follow stays true so the
  // crawl still flows through its links.
  //
  // Nothing is lost: v_sitemap_cities lists published content only, so a page
  // in this state was never advertised in the sitemap either. The moment it
  // gains content or inventory, this flips back on its own.
  const isThin = !content && destination.stats.availableUnits === 0;

  const image = ogImage(imageUrl);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      ...(languages ? { languages } : {}),
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      siteName: SITE_NAME,
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
      ...(image
        ? { images: [{ url: image, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: cityName }] }
        : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    ...(isThin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function DestinationPage({ params }: Props) {
  const { locale, city } = await params;

  const destination = await resolveDestination(city, locale);
  // Only an unknown slug 404s. A real city with no editorial copy — or even
  // with no units today — renders: it is a URL we link to and publish, and
  // turning it into a 404 would break links we control.
  if (!destination) notFound();

  const { stats, content, slug } = destination;
  const path = `/destinations/${slug}`;

  const [t, cityName, { units, total }] = await Promise.all([
    getTranslations({ locale, namespace: 'pages.destinations' }),
    // Display name only. The QUERY below must use the raw geo_cities.name —
    // that is what getPublicUnits filters on (case-insensitive), and it is NOT
    // unit_info.city, which is free text and disagrees with the lookup table.
    // See the note in queries/stays.
    localizedCityName(stats.cityName, locale),
    getPublicUnits(locale, { city: stats.cityName }, 1),
  ]);

  const heading = content?.h1 ?? t('headingFallback', { city: cityName });
  const hasMore = total > units.length;
  // The filter value is the raw lookup-table name, not the display name.
  const allStaysHref = `/stays?city=${encodeURIComponent(stats.cityName.toLowerCase())}`;

  // ── Structured data ───────────────────────────────────────────────────────
  // FAQPage is emitted ONLY when there is published FAQ content, so a fallback
  // page (no city_content for this locale) carries breadcrumbs and the unit
  // list and nothing else. faqSchema returns null on an empty array and graph()
  // drops nulls, so this needs no branch here — but the intent is worth stating:
  // an FAQPage with no questions is invalid markup, and one whose questions are
  // not visible on the page is a structured-data violation. Both are avoided by
  // feeding the schema the exact array CityFaq renders.
  const jsonLd = graph(
    breadcrumbSchema([
      { name: t('breadcrumbHome'), url: canonical(locale, '') },
      { name: t('breadcrumbStays'), url: canonical(locale, '/stays') },
      { name: cityName, url: canonical(locale, path) },
    ]),
    content ? faqSchema(content.faq) : null,
    itemListSchema(
      units.map((u) => ({
        name: u.ad_title ?? u.unit_name ?? '',
        url: canonical(locale, `/stays/${u.slug ?? u.id}`),
        image: (u.media.find((m) => m.is_cover) ?? u.media[0])?.public_url ?? null,
        price: u.pricing.nightly_usd,
      })),
    ),
  );

  return (
    <div className="min-h-screen bg-paper">
      <JsonLd data={jsonLd} />
      <Header />

      <main className="max-w-screen-xl mx-auto px-4 pt-8 pb-24">

        {/* Breadcrumb — a real nav, not decoration. Phase 4 mirrors it in
            BreadcrumbList JSON-LD, and that markup must describe something the
            page actually shows. */}
        <nav aria-label={t('breadcrumbLabel')} className="mb-8">
          <ol className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
            <li>
              <Link href="/" className="hover:text-ink transition-colors duration-[240ms]">
                {t('breadcrumbHome')}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-3 h-3 rtl:rotate-180" />
            </li>
            <li>
              <Link
                href="/stays"
                className="hover:text-ink transition-colors duration-[240ms]"
              >
                {t('breadcrumbStays')}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-3 h-3 rtl:rotate-180" />
            </li>
            <li className="text-ink" aria-current="page">{cityName}</li>
          </ol>
        </nav>

        {/* ── Heading + live stats ──────────────────────────────────────── */}
        <FadeUp>
          <header className="max-w-2xl mb-10">
            <h1 className="mb-4 text-[clamp(1.75rem,5vw,2.75rem)] font-medium tracking-[-0.04em] leading-[1.05] text-ink">
              {heading}
            </h1>

            <CityStatsBar stats={stats} locale={locale} />

            {content?.intro && (
              <p className="mt-6 text-[17px] md:text-[19px] text-ink-soft leading-relaxed">
                {content.intro}
              </p>
            )}

            {content && content.highlights.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2">
                {content.highlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="rounded-[999px] bg-paper-warm px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft"
                  >
                    {highlight}
                  </li>
                ))}
              </ul>
            )}
          </header>
        </FadeUp>

        {/* ── Editorial body ────────────────────────────────────────────── */}
        {content?.body && (
          <FadeUp>
            <article className="mb-4">
              <CityBody markdown={content.body} />
            </article>
          </FadeUp>
        )}

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        {content && content.faq.length > 0 && (
          <FadeUp>
            <CityFaq items={content.faq} heading={t('faqHeading', { city: cityName })} />
          </FadeUp>
        )}

        {/* ── The actual inventory ──────────────────────────────────────── */}
        {/* Below the prose on purpose: the answer to "what is it like to stay in
            {city}" is what a search or an answer engine came for, and the grid
            is the conversion step that follows it. */}
        <section className="mt-16 -mx-4">
          <h2 className="px-4 mb-6 text-[19px] font-medium tracking-[-0.025em] text-ink">
            {t('unitsHeading', { city: cityName })}
          </h2>

          {units.length > 0 ? (
            <>
              <StaysGallery units={units} />
              {hasMore && (
                <div className="px-4 pt-10 text-center">
                  <Link
                    href={allStaysHref}
                    className="inline-flex items-center gap-1.5 rounded-[999px] bg-ink px-6 py-2.5 text-sm font-medium text-white transition-opacity duration-[240ms] hover:opacity-80"
                  >
                    {t('viewAll', { city: cityName, count: total })}
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </>
          ) : (
            <p className="px-4 py-12 text-ink-soft leading-relaxed">
              {t('noUnits', { city: cityName })}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
