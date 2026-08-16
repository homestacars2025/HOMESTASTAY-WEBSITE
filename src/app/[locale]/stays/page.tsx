import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { StaysGallery } from '@/components/stays/StaysGallery';
import { StaysSkeleton } from '@/components/stays/StaysSkeleton';
import { SearchBarWrapper } from '@/components/home/SearchBarWrapper';
import { CategoryChips } from '@/components/home/CategoryChips';
import { DestinationsRail } from '@/components/destinations/DestinationsRail';
import { Link } from '@/i18n/navigation';
import { getPublicUnits, LISTING_PAGE_SIZE, type StaysFilters } from '@/lib/queries/stays';
import { parseStaysSearchParams, buildStaysQuery } from '@/lib/stays/search-params';

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

/** First value of a possibly-repeated query param. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 1-based page from the URL; anything invalid degrades to page 1. */
function pageFrom(value: string | string[] | undefined): number {
  const n = Number.parseInt(one(value) ?? '1', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Dates + guests only (no city) — the bit a unit page needs to preselect. */
function unitSearchQuery(filters: StaysFilters): string {
  const q = new URLSearchParams();
  if (filters.checkIn && filters.checkOut) {
    q.set('checkIn', filters.checkIn);
    q.set('checkOut', filters.checkOut);
  }
  if (filters.guests) q.set('guests', String(filters.guests));
  return q.toString();
}

export default async function StaysPage({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, rawParams] = await Promise.all([
    getTranslations('pages.stays'),
    getLocale(),
    searchParams,
  ]);

  // Params are visitor-editable, so anything invalid degrades to "no filter"
  // rather than erroring or emptying the page.
  const filters = parseStaysSearchParams(rawParams);
  const page = pageFrom(rawParams.page);

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

        {/* The chips live here as well as on the homepage: this is where a
            guest can see what the filter did, and switch without going back. */}
        <div className="mb-8">
          <CategoryChips filters={filters} />
        </div>

        {/* Crawlable links into the city landing pages. Without a link path
            from an indexed page, /destinations/* exists only in the sitemap —
            which Google treats as a hint, not an endorsement. */}
        <div className="mb-10">
          <DestinationsRail locale={locale} />
        </div>

        {/* The results stream in their own boundary so the header + search bar
            never freeze. Keyed by the active filters/page so a new search shows
            the branded skeleton instead of the stale grid while it resolves. */}
        <Suspense
          key={`${JSON.stringify(filters)}:${page}`}
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

  const { units, total } = await getPublicUnits(locale, filters, page);
  const isFiltered = Object.keys(filters).length > 0;

  if (units.length === 0) {
    // A search that matched nothing is not the same as an empty catalogue:
    // offering "become a host" here would answer a question nobody asked.
    return isFiltered ? (
      <div className="px-4 py-20 text-center max-w-md mx-auto">
        <h2 className="text-lg font-medium text-ink mb-2 tracking-[-0.015em]">
          {t('searchEmpty.title')}
        </h2>
        <p className="text-ink-soft leading-relaxed mb-6">{t('searchEmpty.body')}</p>
        <Link
          href="/stays"
          className="inline-flex items-center gap-1.5 bg-ink text-white rounded-[999px] px-6 py-2.5 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-80"
        >
          {t('searchEmpty.cta')}
        </Link>
      </div>
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

  const totalPages = Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE));

  return (
    <>
      <StaysGallery units={units} searchQuery={unitSearchQuery(filters)} />
      {totalPages > 1 && (
        <Pagination filters={filters} page={page} totalPages={totalPages} t={t} />
      )}
    </>
  );
}

function Pagination({
  filters,
  page,
  totalPages,
  t,
}: {
  filters: StaysFilters;
  page: number;
  totalPages: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  // Preserve every active filter across pages; only `page` changes.
  const base = buildStaysQuery(filters);
  const hrefFor = (p: number) => `/stays${base}${base ? '&' : '?'}page=${p}` as '/stays';

  const pill =
    'inline-flex items-center gap-1.5 rounded-[999px] border border-rule px-5 py-2.5 text-sm font-medium text-ink-soft transition-colors duration-[240ms] hover:text-ink hover:border-ink-soft';
  const pillOff =
    'inline-flex items-center gap-1.5 rounded-[999px] border border-rule px-5 py-2.5 text-sm font-medium text-mute opacity-40 cursor-not-allowed';

  return (
    <nav aria-label={t('pagination.label')} className="flex items-center justify-center gap-3 px-4 pt-14">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={pill} rel="prev">
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
          {t('pagination.previous')}
        </Link>
      ) : (
        <span className={pillOff} aria-disabled="true">
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
          {t('pagination.previous')}
        </span>
      )}

      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute tabular-nums px-1">
        {t('pagination.status', { current: page, total: totalPages })}
      </span>

      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={pill} rel="next">
          {t('pagination.next')}
          <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      ) : (
        <span className={pillOff} aria-disabled="true">
          {t('pagination.next')}
          <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
