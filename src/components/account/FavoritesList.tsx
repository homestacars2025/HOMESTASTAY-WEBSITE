'use client';

import { useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { UnitCard } from '@/components/home/UnitCard';
import { useFavorites } from '@/contexts/FavoritesContext';
import { favoriteCards } from '@/app/[locale]/account/favorites/actions';
import type { StayCard } from '@/lib/queries/stays';

/**
 * The saved places. The list of ids lives in the browser's favorites context
 * (the account's rows, or this browser's until the account table exists), so
 * the cards are looked up from here: a server render cannot see localStorage.
 * Un-saving a card removes it at once; the lookup only runs for ids not
 * already on screen.
 */
export function FavoritesList() {
  const t = useTranslations('favorites');
  const locale = useLocale();
  const { ids, ready } = useFavorites();
  const [cards, setCards] = useState<Map<string, StayCard>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  const missing = ids.filter((id) => !cards.has(id));
  const missingKey = missing.join(',');

  useEffect(() => {
    if (!ready) return;
    if (!missingKey) { setLoaded(true); return; }
    startTransition(async () => {
      const found = await favoriteCards(locale, missingKey.split(','));
      setCards((prev) => {
        const next = new Map(prev);
        for (const c of found) next.set(c.id, c);
        return next;
      });
      setLoaded(true);
    });
  }, [ready, missingKey, locale]);

  const shown = ids.flatMap((id) => cards.get(id) ?? []);

  if (!ready || (!loaded && ids.length > 0)) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
        {Array.from({ length: Math.min(Math.max(ids.length, 3), 6) }, (_, i) => (
          <div key={i} className="aspect-[4/3] rounded-[14px] bg-paper-warm animate-pulse" />
        ))}
      </div>
    );
  }

  if (shown.length === 0) {
    return (
      <div className="py-16 text-center max-w-md mx-auto">
        <p className="text-ink-soft leading-relaxed mb-6">{t('empty')}</p>
        <Link
          href="/stays"
          className="inline-flex items-center gap-1.5 bg-ink text-white rounded-[999px] px-6 py-2.5 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-80"
        >
          {t('browse')}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {shown.map((unit, i) => (
        <UnitCard key={unit.id} unit={unit} source="results" position={i + 1} prefetchOnIntent />
      ))}
    </div>
  );
}
