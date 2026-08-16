import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Tajawal, Cairo } from 'next/font/google';
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

// Arabic body font — clean, readable; workhorse for all Arabic UI text
const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-tajawal',
  preload: false,
});

// Arabic accent font — used only for headings in Arabic locale
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-cairo',
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
      className={`${GeistSans.variable} ${GeistMono.variable}${isArabic ? ` ${tajawal.variable} ${cairo.variable}` : ''}`}
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
