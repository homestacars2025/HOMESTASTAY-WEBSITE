import { getTranslations } from 'next-intl/server';
import { Tag, Users, Zap } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { FadeUp } from '@/components/motion/FadeUp';
import { HostForm } from '@/components/host/HostForm';
import { getHostGeoData } from '@/lib/data/cities';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.host' });
  return { title: t('title') };
}

const TRUST_POINTS = [
  { key: 'free',     Icon: Tag   },
  { key: 'guests',   Icon: Users },
  { key: 'bookings', Icon: Zap   },
] as const;

// Known i18n keys in the 'cities' namespace — for localized city names in the dropdown
const CITY_KEYS = ['istanbul', 'trabzon', 'sapanca', 'antalya', 'fethiye', 'bodrum'] as const;
type CityKey = typeof CITY_KEYS[number];

export default async function HostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const [t, tCities, geoData] = await Promise.all([
    getTranslations({ locale, namespace: 'pages.host' }),
    getTranslations({ locale, namespace: 'cities' }),
    getHostGeoData(),
  ]);

  // Enrich cities with localized display names; fall back to English DB name
  const localizedCities = geoData.cities.map((c) => ({
    id:           c.id,
    name:         c.name,
    localizedName: CITY_KEYS.includes(c.key as CityKey)
      ? tCities(c.key as CityKey)
      : c.name,
    hasDistricts: c.hasDistricts,
  }));

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-xl mx-auto px-4 pt-24 pb-20">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <FadeUp>
          <section className="mb-10">
            {/* Eyebrow badge */}
            <span className="inline-flex items-center rounded-[999px] border border-stay/30 bg-stay/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.09em] text-stay mb-5">
              {t('title')}
            </span>

            <h1 className="text-[clamp(1.9rem,6vw,2.75rem)] font-medium tracking-[-0.04em] leading-[1.0] text-ink mb-4">
              {t('headline')}
            </h1>

            <p className="text-base text-mute leading-relaxed mb-8">
              {t('subline')}
            </p>

            {/* Trust row */}
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {TRUST_POINTS.map(({ key, Icon }) => (
                <div key={key} className="flex items-center gap-2">
                  <Icon size={15} strokeWidth={1.75} className="text-stay shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium text-ink-soft">
                    {t(`trust.${key}`)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </FadeUp>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="h-px bg-rule mb-10" aria-hidden="true" />

        {/* ── Form ─────────────────────────────────────────────────────── */}
        <FadeUp delay={0.06}>
          <HostForm
            cities={localizedCities}
            districtsByCityId={geoData.districtsByCityId}
          />
        </FadeUp>

      </main>
    </div>
  );
}
