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
import '@/styles/globals.css';

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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://homestastay.com'
  ),
  title: 'Homesta Stay',
  description: 'Short-term and touristic rentals in Istanbul',
  icons: {
    icon:  [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.webmanifest',
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
