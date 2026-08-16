import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { listDestinations } from '@/lib/queries/destinations';
import { localizedCityName } from '@/lib/geo/city-name';

/**
 * A row of city links, for surfaces that list stays.
 *
 * This is the internal-linking half of Law 3. A city page that only the
 * sitemap knows about is a page with no inbound links and no crawl priority;
 * Google follows links far more readily than it works through a sitemap. The
 * homepage strip and this rail are what actually route crawl equity into
 * /destinations/*.
 *
 * Sorted by live inventory (listDestinations), so the cities most worth
 * ranking for are the ones linked from every listing page.
 */
export async function DestinationsRail({
  locale,
  limit = 10,
}: {
  locale: string;
  limit?: number;
}) {
  const [t, destinations] = await Promise.all([
    getTranslations({ locale, namespace: 'pages.destinations' }),
    listDestinations(locale),
  ]);

  if (destinations.length === 0) return null;

  const shown = await Promise.all(
    destinations.slice(0, limit).map(async (destination) => ({
      ...destination,
      // Display name only — the slug (and so the URL) stays Latin in every locale.
      label: await localizedCityName(destination.cityName, locale),
    })),
  );

  return (
    <nav aria-label={t('exploreHeading')} className="px-4">
      <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
        {t('exploreHeading')}
      </h2>

      <ul className="flex flex-wrap gap-2">
        {shown.map((destination) => (
          <li key={destination.cityId}>
            <Link
              href={`/destinations/${destination.slug}`}
              className="inline-flex items-center gap-2 rounded-[999px] border border-rule px-4 py-2 text-sm text-ink-soft transition-colors duration-[240ms] hover:border-ink-soft hover:text-ink"
            >
              {destination.label}
              <span className="font-mono text-[11px] tabular-nums text-mute">
                {destination.availableUnits}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
