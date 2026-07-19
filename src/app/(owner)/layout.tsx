import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import '@/styles/globals.css';

/**
 * Second root layout, for the owner decision links only.
 *
 * These live outside src/app/[locale] on purpose: the URLs are baked into an
 * approved Meta WhatsApp template as bare /onay/{token} and /ret/{token}, so
 * they can never carry a locale prefix. `(owner)` is a route group — it shapes
 * the tree, not the URL. src/middleware.ts excludes both paths from next-intl,
 * which would otherwise redirect them to /en/….
 *
 * Deliberately minimal: no site footer, no auth gate, no page transitions. An
 * owner opens this from WhatsApp on a phone to answer one question.
 */
export const metadata: Metadata = {
  // Decision links must never be indexed, cached by a crawler, or leak their
  // token through a Referer header on any outbound navigation.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  referrer: 'no-referrer',
  title: 'Homesta Stay',
};

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" dir="ltr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <main className="min-h-screen bg-paper flex flex-col items-center px-4 py-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
      </body>
    </html>
  );
}
