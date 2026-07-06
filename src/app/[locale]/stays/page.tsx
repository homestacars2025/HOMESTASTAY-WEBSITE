import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { StaysGallery } from '@/components/stays/StaysGallery';
import { SampleBar } from '@/components/shared/SampleBar';
import { Link } from '@/i18n/navigation';
import { getPublicUnits } from '@/lib/queries/stays';

// Fresh data per request — real availability, no stale-cache leak of booked/archived units.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.stays' });
  return { title: t('title') };
}

export default async function StaysPage() {
  const t = await getTranslations('pages.stays');

  // Live public listings from Supabase (server-side). The strict visibility
  // filter lives in getPublicUnits; more units appear automatically as hosts
  // fill in ad_title. Real DB units carry is_sample = false, so sample
  // badges/banners stay hidden — the flag is retained for any future preview mode.
  const units = await getPublicUnits();
  const hasSamples = units.some((u) => u.is_sample);

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-screen-xl mx-auto pt-10 pb-24">
        <h1 className="px-4 mb-6 text-[clamp(1.75rem,5vw,2.5rem)] font-medium tracking-[-0.035em] leading-tight text-ink">
          {t('title')}
        </h1>

        {hasSamples && (
          <div className="px-4 mb-6">
            <SampleBar messageKey="indexBanner" />
          </div>
        )}

        {units.length === 0 ? (
          <div className="px-4 py-20 text-center max-w-md mx-auto">
            <h2 className="text-lg font-medium text-ink mb-2 tracking-[-0.015em]">
              {t('emptyState.title')}
            </h2>
            <p className="text-ink-soft leading-relaxed mb-6">
              {t('emptyState.body')}
            </p>
            <Link
              href="/host"
              className="inline-flex items-center gap-1.5 bg-ink text-white rounded-[999px] px-6 py-2.5 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-80"
            >
              {t('emptyState.cta')}
              <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <StaysGallery units={units} />
        )}
      </main>
    </div>
  );
}
