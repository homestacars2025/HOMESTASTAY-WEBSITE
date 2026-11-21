import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import '@/styles/globals.css';

/**
 * Root layout of the DRIVER page (transfer.homestastay.com/d/[token], rewritten
 * here by middleware). Deliberately bare: no site header or footer, no Meta
 * pixel, no Clarity, no event tracker, no JSON-LD — a driver's link is a
 * private working page, not a site page. noindex everywhere (also sent as an
 * X-Robots-Tag header for the whole subdomain, see next.config.ts).
 */

export const metadata: Metadata = {
  title: 'Homesta Transfer',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#FFFFFF' };

const LANGS = new Set(['tr', 'en', 'ar', 'ru']);

export default async function DriverLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const lang = LANGS.has(raw) ? raw : 'tr';
  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className={GeistSans.variable}>
      <body className="bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
