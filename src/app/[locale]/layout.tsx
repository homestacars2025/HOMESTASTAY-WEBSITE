import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { routing, type Locale } from '@/i18n/routing';
import { AuthGateProvider } from '@/contexts/AuthGateContext';
import { MotionProvider } from '@/components/layout/MotionProvider';
import { PageTransition } from '@/components/layout/PageTransition';
import { SiteFooter } from '@/components/home/SiteFooter';
import { JsonLd } from '@/components/seo/JsonLd';
import { graph, organizationSchema, websiteSchema } from '@/lib/seo/schema';
import { MetaPixel } from '@/components/analytics/MetaPixel';
import { Clarity } from '@/components/analytics/Clarity';
import '@/styles/globals.css';
import { CANONICAL_URL } from '@/lib/config/urls';

/**
 * Arabic typeface — the whole Arabic UI, headings included.
 *
 * Matches the Homesta Stay mobile app, so a guest who moves between the two
 * sees one typeface rather than two. Replaces Tajawal, which shipped
 * 400/500/700 and had NO 600 — every Arabic semibold was therefore falling
 * back to 500 or being synthesised by the browser. IBM Plex Sans Arabic has a
 * real 600, so all four weights here are genuine cuts.
 *
 * NOT A CDN, despite the module name: next/font/google downloads the files at
 * BUILD time and serves them from our own origin. There is no request to
 * Google at runtime and no third-party dependency — the self-hosting benefit
 * without hand-writing @font-face.
 *
 * preload: false is deliberate. This font is only needed on /ar, and the
 * variable below is only attached to <html> for that locale, so preloading it
 * would cost every English, Turkish and Russian visitor a download they never
 * use.
 *
 * The 'latin' subset rides along because an Arabic page is full of Latin
 * runs — Homesta, API, +90 — and without it each one would fall back to a
 * different face mid-sentence.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-arabic',
  preload: false,
});

export const metadata: Metadata = {
  // Always the production origin, even on preview — see lib/config/urls.
  metadataBase: new URL(CANONICAL_URL),
  title: 'Homesta Stay',
  description: 'Short-term and touristic rentals in Istanbul',
  manifest: '/manifest.webmanifest',
  // Google Search Console ownership proof. Lives in the root locale layout so
  // the tag is present on every route, not just the homepage.
  verification: {
    google: 'BiHtZhbTpa2xyrYRxaIDmwPXAqC_T8Isvs473Lb2q_Q',
  },
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const isArabic = locale === 'ar';

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${GeistSans.variable} ${GeistMono.variable}${isArabic ? ` ${plexArabic.variable}` : ''}`}
    >
      <body>
        {/* Organization + WebSite, on every page for the same reason the pixel
            is here: they describe the SITE, not the route. Emitting them once
            from the shared layout means a crawler landing on any URL — a unit
            page reached from a search, a city page from an AI answer — can
            resolve the publisher entity without a second fetch.

            Page-level nodes (VacationRental, FAQPage, BreadcrumbList) reference
            this Organization by its @id rather than restating it, which is what
            lets Google merge them into one entity across the site. */}
        <JsonLd data={graph(organizationSchema(locale), websiteSchema(locale))} />

        {/* Mounted here and ONLY here: the root layout is the one component
            every route shares, so the pixel loads once per session rather than
            once per page. */}
        <MetaPixel />
        <Clarity />
        <NextIntlClientProvider messages={messages}>
          <MotionProvider>
            <AuthGateProvider>
              <PageTransition>
                {children}
              </PageTransition>
              <SiteFooter />
            </AuthGateProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
