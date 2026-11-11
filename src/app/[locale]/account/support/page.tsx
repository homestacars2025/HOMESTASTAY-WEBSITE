import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { TicketList } from '@/components/support/TicketList';
import { PRIMARY_PILL } from '@/components/support/parts';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { categoryLabel } from '@/lib/support/model';
import { loadGuestCategories, loadTickets } from '@/lib/support/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'support' });
  return { title: `${t('title')} — Homesta Stay`, robots: { index: false, follow: false, nocache: true } };
}

/** The guest's support requests. Signed-in only, like the rest of /account. */
export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireConfirmedUser(locale, '/account/support');
  const [t, categories, tickets] = await Promise.all([
    getTranslations({ locale, namespace: 'support' }),
    loadGuestCategories(),
    loadTickets(),
  ]);

  const categoryNames: Record<string, string> = {};
  for (const c of categories) categoryNames[c.key] = categoryLabel(categories, c.key, locale) ?? t('untitled');

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-[720px] mx-auto px-4 pt-10 pb-24">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-medium tracking-[-0.035em] leading-tight text-ink">{t('title')}</h1>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">{t('intro')}</p>
          </div>
          <Link href="/account/support/new" className={`${PRIMARY_PILL} self-start sm:self-auto`}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t('newRequest')}
          </Link>
        </div>

        {tickets === null ? (
          <p role="alert" className="border border-rule rounded-[14px] px-6 py-10 text-center text-sm text-ink-soft">
            {t('loadError')}
          </p>
        ) : (
          <TicketList userId={user.id} initial={tickets} categoryNames={categoryNames} />
        )}
      </main>
    </div>
  );
}
