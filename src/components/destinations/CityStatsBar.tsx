import { getTranslations } from 'next-intl/server';
import type { CityLiveStats } from '@/lib/queries/destinations';

/**
 * Live inventory strip, above the editorial copy.
 *
 * Every number here is read from v_city_live_stats at request time. Nothing is
 * hardcoded, and nothing is written into the editorial body — a count baked
 * into prose is wrong the day after it is written, and a wrong count on a page
 * an AI answer engine quotes is worse than no count at all.
 *
 * Renders nothing when the city has no available unit: "0 stays available" is a
 * true statement that no page benefits from making.
 */
export async function CityStatsBar({
  stats,
  locale,
}: {
  stats: CityLiveStats;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'pages.destinations' });

  if (stats.availableUnits <= 0) return null;

  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
      <span className="text-ink">
        {t('unitsAvailable', { count: stats.availableUnits })}
      </span>

      {stats.minPrice !== null && (
        <>
          <span aria-hidden="true"> · </span>
          {t.rich('fromPerNight', {
            // Prices are stored in USD and shown in USD (§9). No conversion here.
            amount: `$${new Intl.NumberFormat(locale).format(Math.round(stats.minPrice))}`,
            // The price is the one figure on this strip that earns the accent —
            // Law 4: red is for prices, CTAs and ratings, nothing else.
            price: (chunks) => (
              <span className="text-stay font-semibold tabular-nums normal-case">
                {chunks}
              </span>
            ),
          })}
        </>
      )}
    </p>
  );
}
