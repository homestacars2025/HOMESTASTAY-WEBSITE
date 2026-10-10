import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { FavoritesList } from '@/components/account/FavoritesList';
import { requireConfirmedUser } from '@/lib/auth/require-user';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'favorites' });
  return { title: `${t('title')} — Homesta Stay`, robots: { index: false, follow: false } };
}

/** The guest's saved places. Signed-in only, like the rest of /account. */
export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireConfirmedUser(locale, '/account/favorites');
  const t = await getTranslations({ locale, namespace: 'favorites' });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 pt-10 pb-24">
        <h1 className="mb-8 text-[clamp(1.75rem,5vw,2.5rem)] font-medium tracking-[-0.035em] leading-tight text-ink">
          {t('title')}
        </h1>
        <FavoritesList />
      </main>
    </div>
  );
}
