import { getTranslations, getLocale } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { StaysGallery } from '@/components/stays/StaysGallery';
import { SearchBarWrapper } from '@/components/home/SearchBarWrapper';
import { Link } from '@/i18n/navigation';
import { getPublicUnits } from '@/lib/queries/stays';
import { parseStaysSearchParams } from '@/lib/stays/search-params';

// Fresh data per request — real availability, no stale-cache leak of booked/archived units.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.stays' });
  return {
    title: t('title'),
    // A filtered listing is a slice of the index, not its own page. Letting each
    // city/date/guest permutation be indexed would spray near-duplicates across
    // the crawl budget, so point them all at the canonical /stays.
    alternates: { canonical: '/stays' },
  };
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
  const isFiltered = Object.keys(filters).length > 0;

  // Live public listings from Supabase (server-side). The strict visibility
  // filter lives in getPublicUnits; more units appear automatically as hosts
  // fill in ad_title. Card titles are resolved for the visitor's locale
  // (unit_translations).
  // First page only for now — capped at 24 in getPublicUnits. The prev/next UI
  // that uses `total` is 1ب; this already stops the whole-catalogue fetch.
  const { units } = await getPublicUnits(locale, filters);

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-screen-xl mx-auto pt-10 pb-24">
        <h1 className="px-4 mb-6 text-[clamp(1.75rem,5vw,2.5rem)] font-medium tracking-[-0.035em] leading-tight text-ink">
          {t('title')}
        </h1>

        <div className="px-4 mb-10">
          <SearchBarWrapper filters={filters} />
        </div>

        {units.length === 0 ? (
          isFiltered ? (
            // A search that matched nothing is not the same as an empty catalogue:
            // offering "become a host" here would answer a question nobody asked.
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
          )
        ) : (
          <StaysGallery units={units} />
        )}
      </main>
    </div>
  );
}
