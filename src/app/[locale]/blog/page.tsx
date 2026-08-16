import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';

// Listed in sitemap.xml but had no canonical and no hreflang — the same defect
// as the homepage, on a page the sitemap is actively pushing at Google.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pages.blog' });

  const canonicalUrl = canonical(locale, '/blog');
  const title = t('metaTitle');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates('/blog', 'en'),
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

export default function BlogPage() {
  const t = useTranslations('pages.blog');

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-16">
        <h1 className="text-[clamp(2rem,7vw,3rem)] font-medium tracking-[-0.04em] leading-[0.95] text-ink mb-4">
          {t('title')}
        </h1>
        <p className="text-base text-mute leading-relaxed max-w-sm">
          {t('comingSoon')}
        </p>
      </main>
    </div>
  );
}
