import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { requireConfirmedUser } from '@/lib/auth/require-user';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'myBookings' });
  return { title: `${t('title')} — Homesta Stay` };
}

export default async function MyBookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Signed in AND email-confirmed, enforced server-side. Redirects otherwise.
  await requireConfirmedUser(locale, '/my-bookings');

  const t = await getTranslations({ locale, namespace: 'myBookings' });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 pt-16 pb-24 flex flex-col items-center text-center">
        <h1 className="text-[clamp(1.5rem,4vw,2.25rem)] font-medium tracking-[-0.035em] text-ink mb-3">
          {t('title')}
        </h1>

        {/* Empty state — will be replaced once booking flow is built */}
        <div className="mt-12 flex flex-col items-center gap-4 max-w-xs">
          <p className="text-base font-medium text-ink">{t('emptyTitle')}</p>
          <p className="text-sm text-mute leading-relaxed">{t('emptySubtitle')}</p>
          <Link
            href="/stays"
            className="mt-2 inline-flex items-center gap-1.5 bg-ink text-white rounded-[999px] px-6 py-2.5 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-80"
          >
            {t('browseStays')}
          </Link>
        </div>
      </main>
    </div>
  );
}
