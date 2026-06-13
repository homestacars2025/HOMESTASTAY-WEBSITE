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
  // TODO: replace ALL_UNITS with a Supabase query (units + unit_info + unit_media + unit_amenities)
  //   filtered to status = 'available', ordered by rating desc.
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
