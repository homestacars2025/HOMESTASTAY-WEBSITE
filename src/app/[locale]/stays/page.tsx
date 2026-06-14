import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { Header } from '@/components/home/Header';
import { StaysGallery } from '@/components/stays/StaysGallery';
import { SampleBar } from '@/components/shared/SampleBar';
import { ALL_UNITS } from '@/lib/mock/units';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.stays' });
  return { title: t('title') };
}

export default function StaysPage() {
  const t = useTranslations('pages.stays');

  // Server Component: pass all available units to the client gallery.
  // TODO: replace ALL_UNITS with a Supabase query.
  // When implementing the real listing query, it MUST include:
  //   .is('archived_at', null)     — exclude admin-archived units (units.archived_at added
  //                                  2026-06; HP-ADMIN soft-archive). Without this filter,
  //                                  units archived in HP-ADMIN will leak onto the public site.
  //   .eq('status', 'available')   — only publicly bookable units (matches the mock filter below;
  //                                  'available' is from unit_status_enum in src/lib/types/unit.ts).
  // The public listing is units-only (no standalone properties page yet), but units belong to a
  // parent property. The query must ALSO exclude units whose parent property is archived — filter
  // by the joined properties.archived_at IS NULL (added 2026-06; HP-ADMIN soft-archive) so that
  // archiving a property in HP-ADMIN hides all of its units on the public site too. When a
  // properties listing is eventually added, that query must likewise apply:
  //   .is('archived_at', null)     — exclude admin-archived properties
  //   .eq('status', 'available')   — only publicly listable properties (confirm exact value)
  // Shape needed: units + unit_info + unit_media + unit_amenities (see mock/units.ts for the
  //   expected fields). Order by rating desc.
  const units = ALL_UNITS.filter((u) => u.status === 'available');
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

        <StaysGallery units={units} />
      </main>
    </div>
  );
}
