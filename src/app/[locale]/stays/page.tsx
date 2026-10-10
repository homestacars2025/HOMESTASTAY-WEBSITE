import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';
import { ArrowRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Header } from '@/components/home/Header';
import { StaysSkeleton } from '@/components/stays/StaysSkeleton';
import { StaysBrowser } from '@/components/stays/StaysBrowser';
import type { DistrictOption } from '@/components/stays/FiltersSheet';
import { pickLocalizedName } from '@/lib/geo/localize';
import { SearchBarWrapper } from '@/components/home/SearchBarWrapper';
import { Link } from '@/i18n/navigation';
import { getCatalogueFacets, getStaysCatalogue, type StaysFilters } from '@/lib/queries/stays';
import { applyPlace, resolvePlace, type PlaceMatch } from '@/lib/stays/places';
import { getEmptySuggestions } from '@/lib/stays/suggestions';
import { EmptySuggestions } from '@/components/stays/EmptySuggestions';
import { localizedCityName } from '@/lib/geo/city-name';
import {
  parseStaysSearchParams,
  parseStaysPage,
  buildStaysQueryWithPage,
} from '@/lib/stays/search-params';

// Fresh data per request — real availability, no stale-cache leak of booked/archived units.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * THE CANONICAL BUG THIS FIXES
 *   The canonical was the bare string '/stays'. Next resolves a relative
 *   canonical against metadataBase, producing
 *   https://www.homestastay.com/stays — a URL that does not serve this page.
 *   localePrefix is 'always', so /stays 307-redirects to /en/stays. Every
 *   locale of this page was therefore declaring a REDIRECT as its canonical,
 *   and the Arabic, Turkish and Russian listings were all pointing at the same
 *   English-redirecting URL — telling Google those three pages are duplicates
 *   of an English one. canonical() from lib/config/urls builds the prefixed,
 *   absolute form and cannot express the broken one.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.stays' });

  const canonicalUrl = canonical(locale, '/stays');
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      // A filtered listing is a slice of the index, not its own page. Letting
      // each city/date/guest permutation be indexed would spray near-duplicates
      // across the crawl budget, so every permutation still points here — but
      // at THIS locale's index, not at a redirect.
      canonical: canonicalUrl,
      languages: hreflangAlternates('/stays', 'en'),
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      siteName: SITE_NAME,
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
      images: defaultOgImages(),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: defaultOgImages().map((i) => i.url),
    },
  };
}

/**
 * The whole active search, for the link into a unit page.
 *
 * It used to be dates + guests only, which meant the city, the category and
 * the page number were gone the moment a guest opened a unit — and the back
 * link on the detail page had nothing left to rebuild the search from. The
 * unit page still reads only the dates/guests it needs for the booking card;
 * the rest rides along so it can hand the guest back their results.
 */

export default async function StaysPage({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, rawParams] = await Promise.all([
    getTranslations('pages.stays'),
    getLocale(),
    searchParams,
  ]);

  // Params are visitor-editable, so anything invalid degrades to "no filter"
  // rather than erroring or emptying the page.
  // The place is resolved before anything else reads it: İstanbul, ISTANBUL
  // and إسطنبول are Istanbul; Taksim is Istanbul with Beyoğlu ranked first;
  // Kartepe is the nearest city with places; nonsense is "all places" — each
  // with the note below saying what is shown. Never an empty page for spelling.
  const parsed = parseStaysSearchParams(rawParams);
  const place = parsed.city ? await resolvePlace(parsed.city) : null;
  const filters = applyPlace(parsed, place);
  const page = parseStaysPage(rawParams);

  // Old category links still land on the right chip: ?type=studio becomes
  // ?type=apartment, ?type=room / suite become ?type=hotels, plural keys and
  // lists collapse to one. Anything unrecognisable simply shows All. Redirected
  // once so the address bar (and anything shared from it) is the canonical one.
  const rawType = Array.isArray(rawParams.type) ? rawParams.type.join(',') : rawParams.type;
  if (rawType !== undefined && rawType !== (filters.category ?? '')) {
    redirect(`/${locale}/stays${buildStaysQueryWithPage(filters, page)}`);
  }

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-screen-xl mx-auto pt-10 pb-24">
        <h1 className="px-4 mb-6 text-[clamp(1.75rem,5vw,2.5rem)] font-medium tracking-[-0.035em] leading-tight text-ink">
          {t('title')}
        </h1>

        <div className="px-4 mb-6">
          <SearchBarWrapper filters={filters} collapsible />
        </div>

        <PlaceNote place={place} locale={locale} />

        {/* The results stream in their own boundary so the header + search bar
            never freeze. Keyed by the active filters/page so a new search shows
            the branded skeleton instead of the stale grid while it resolves. */}
        <Suspense
          // Not keyed on the category or page: those change in place on the
          // client (StaysBrowser) and must never re-trigger the skeleton.
          key={JSON.stringify({ ...filters, category: undefined })}
          fallback={<StaysSkeleton />}
        >
          <StaysResults locale={locale} filters={filters} page={page} />
        </Suspense>
      </main>
    </div>
  );
}

async function StaysResults({
  locale,
  filters,
  page,
}: {
  locale: string;
  filters: StaysFilters;
  page: number;
}) {
  const t = await getTranslations('pages.stays');

  // The whole search ONCE — every category — so the chips filter on the
  // client with no request (see getStaysCatalogue / StaysBrowser).
  const { category, ...shared } = filters;
  const [cards, facets] = await Promise.all([getStaysCatalogue(locale, shared), getCatalogueFacets()]);
  const isFiltered = Object.values(filters).some((v) => v !== undefined);

  // Districts of the chosen city that hold units, localised here so the
  // client gets display strings, not table rows.
  const districts: DistrictOption[] = shared.city
    ? (facets.districtsByCity[shared.city.toLowerCase()] ?? []).map((d) => ({
        key: d.key,
        label: pickLocalizedName(locale, d) ?? d.key,
        count: d.count,
      }))
    : [];

  if (cards.length === 0) {
    // A search that matched nothing is not the same as an empty catalogue:
    // offering "become a host" here would answer a question nobody asked. It
    // gets the nearest searches that DO have places instead.
    return isFiltered ? (
      <EmptySuggestions locale={locale} filters={shared} suggestions={await getEmptySuggestions(shared)} />
    ) : (
      <div className="px-4 py-20 text-center max-w-md mx-auto">
        <h2 className="text-lg font-medium text-ink mb-2 tracking-[-0.015em]">
          {t('emptyState.title')}
        </h2>
        <p className="text-ink-soft leading-relaxed mb-6">{t('emptyState.body')}</p>
        <Link
          href="/host"
          className="inline-flex items-center gap-1.5 bg-ink text-white rounded-[999px] px-6 py-2.5 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-80"
        >
          {t('emptyState.cta')}
          <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <StaysBrowser
      cards={cards}
      filters={shared}
      initialCategory={category ?? 'all'}
      initialPage={page}
      districts={districts}
    />
  );
}

/**
 * What the place in the search was taken to mean, when it was not simply a
 * city: an area ("Taksim first"), the nearest city with places, or nothing.
 */
async function PlaceNote({ place, locale }: { place: PlaceMatch | null; locale: string }) {
  if (!place || place.kind === 'exact') return null;
  const t = await getTranslations({ locale, namespace: 'pages.stays.place' });
  const text = place.kind === 'unknown'
    ? t('unknown', { place: place.query })
    : place.kind === 'near'
      ? t('near', { place: place.query, city: await localizedCityName(place.city, locale), km: place.km })
      : null;
  if (place.kind === 'area') {
    return (
      <p role="status" className="px-4 -mt-2 mb-6 text-sm text-ink-soft">
        {t('area', { city: await localizedCityName(place.city, locale), place: place.label })}
      </p>
    );
  }
  return (
    <p role="status" className="px-4 -mt-2 mb-6 text-sm text-ink-soft">{text}</p>
  );
}
