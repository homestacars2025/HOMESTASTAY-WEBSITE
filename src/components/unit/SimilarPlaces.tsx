import { getTranslations } from 'next-intl/server';
import { UnitCard } from '@/components/home/UnitCard';
import { getSimilarUnits, type SimilarRequest } from '@/lib/queries/stays';
import { buildStaysQuery } from '@/lib/stays/search-params';
import { ScrollRow } from '@/components/shared/ScrollRow';

const ROW = '-mx-4 px-4 flex gap-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const CARD = 'flex-none w-[260px] md:w-[280px] snap-start';

/**
 * "Similar places you may like" — a swipeable row under the map. Streams in
 * its own Suspense boundary, so the unit page never waits for it. Card links
 * keep the dates and guests the visitor came with.
 */
export async function SimilarPlaces({ unitId, locale, search }: { unitId: string; locale: string; search: SimilarRequest }) {
  const [t, cards] = await Promise.all([
    getTranslations({ locale, namespace: 'unit' }),
    getSimilarUnits(unitId, locale, search),
  ]);
  // A row of one is not a choice; better no section than a lonely card.
  if (cards.length < 2) return null;
  const searchQuery = buildStaysQuery({ checkIn: search.checkIn, checkOut: search.checkOut, guests: search.guests }).replace(/^\?/, '');

  return (
    <section aria-labelledby="similar-heading" className="mt-16">
      <h2 id="similar-heading" className="mb-5 text-xl font-medium tracking-[-0.02em] text-ink">
        {t('similarTitle')}
      </h2>
      <ScrollRow className={ROW} prevLabel={t('similarPrev')} nextLabel={t('similarNext')}>
        {cards.map((unit, i) => (
          <UnitCard
            key={unit.id}
            unit={unit}
            className={CARD}
            searchQuery={searchQuery}
            source="similar"
            position={i + 1}
            prefetchOnIntent
          />
        ))}
      </ScrollRow>
    </section>
  );
}

/** Same footprint as the row, so nothing below moves when it arrives. */
export function SimilarPlacesSkeleton() {
  return (
    <div className="mt-16" aria-hidden="true">
      <div className="mb-5 h-7 w-64 rounded-[8px] bg-paper-warm" />
      <div className={ROW}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={CARD}>
            <div className="aspect-[4/3] rounded-[14px] bg-paper-warm mb-3" />
            <div className="h-4 w-3/4 rounded bg-paper-warm mb-2" />
            <div className="h-3 w-1/2 rounded bg-paper-warm mb-2" />
            <div className="h-4 w-1/3 rounded bg-paper-warm" />
          </div>
        ))}
      </div>
    </div>
  );
}
