import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Tag, Users, Zap } from 'lucide-react';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';
import { Header } from '@/components/home/Header';
import { FadeUp } from '@/components/motion/FadeUp';
import { HostForm } from '@/components/host/HostForm';
import { getHostGeoData } from '@/lib/data/cities';

// Listed in sitemap.xml but had no canonical and no hreflang. This is also the
// page owners search for ("list my property Istanbul"), so it is worth ranking
// on its own rather than as an untitled sibling of the homepage.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.host' });

  const canonicalUrl = canonical(locale, '/host');
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates('/host', 'en'),
    },
    openGraph: {
      title, description, url: canonicalUrl, type: 'website',
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

const TRUST_POINTS = [
  { key: 'free',     Icon: Tag   },
  { key: 'guests',   Icon: Users },
  { key: 'bookings', Icon: Zap   },
] as const;

export default async function HostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const [t, geoData] = await Promise.all([
    getTranslations({ locale, namespace: 'pages.host' }),
    // Names come localised from geo_cities/geo_districts, so every city in the
    // table is covered rather than the six that had message keys.
    getHostGeoData(locale),
  ]);

  const localizedCities = geoData.cities.map((c) => ({
    id:            c.id,
    name:          c.name,
    localizedName: c.localizedName,
    hasDistricts:  c.hasDistricts,
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
