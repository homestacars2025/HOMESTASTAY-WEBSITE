import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { NewRequestForm } from '@/components/support/NewRequestForm';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { categoryLabel, newRequestHref, parsePrefill } from '@/lib/support/model';
import { loadGuestCategories, loadMyBookings } from '@/lib/support/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'support' });
  return { title: `${t('new.title')} — Homesta Stay`, robots: { index: false, follow: false, nocache: true } };
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * New request — `?category=…&booking=…` prefill it (the "Get help" links on
 * the booking page). Not signed in → sign-in, then straight back here with the
 * same prefill.
 */
export default async function NewSupportRequestPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const q = await searchParams;

  // The return path carries the prefill through sign-in. Shape-checked only
  // (a signed-out visitor cannot read the categories to check against), and
  // rebuilt from those checked values so nothing from the URL is echoed raw.
  const shaped = parsePrefill(q, typeof q.category === 'string' && /^guest_[a-z_]{1,40}$/.test(q.category) ? [q.category] : []);
  await requireConfirmedUser(locale, newRequestHref({ category: shaped.category, booking: shaped.bookingId }));

  const [t, categories, bookings] = await Promise.all([
    getTranslations({ locale, namespace: 'support' }),
    loadGuestCategories(),
    loadMyBookings(),
  ]);
  const prefill = parsePrefill(q, categories.map((c) => c.key));

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-[640px] mx-auto px-4 pt-8 pb-16 sm:pb-24">
        <Link
          href="/account/support"
          className="-ms-1 mb-6 inline-flex min-h-[44px] items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] rtl:tracking-normal rtl:font-sans text-mute hover:text-ink transition-colors duration-[240ms]"
        >
          <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
          {t('back')}
        </Link>
        <h1 className="text-[clamp(1.75rem,5vw,2.25rem)] font-medium tracking-[-0.035em] leading-tight text-ink">{t('new.title')}</h1>
        <p className="mt-2 mb-8 max-w-md text-[15px] leading-relaxed text-ink-soft">{t('new.intro')}</p>

        <NewRequestForm
          categories={categories.map((c) => ({ key: c.key, label: categoryLabel(categories, c.key, locale) ?? c.key }))}
          bookings={bookings}
          prefill={prefill}
        />
      </main>
    </div>
  );
}
