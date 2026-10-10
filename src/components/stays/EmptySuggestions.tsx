import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { localizedCityName } from '@/lib/geo/city-name';
import { buildStaysQuery } from '@/lib/stays/search-params';
import type { StaysFilters } from '@/lib/stays/filters';
import type { Suggestions } from '@/lib/stays/suggestions';
import { SearchTracker } from '@/components/analytics/SearchTracker';

const pill =
  'inline-flex min-h-11 items-center gap-1.5 rounded-[999px] border border-rule bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors duration-[240ms] hover:border-ink-soft hover:bg-paper-warm';

/**
 * The empty search, with a way forward: one tap to the nearest search that
 * does have places. Every button carries a count, because each one is a real
 * search that was already run (see lib/stays/suggestions).
 */
export async function EmptySuggestions({
  locale,
  filters,
  suggestions,
}: {
  locale: string;
  filters: StaysFilters;
  suggestions: Suggestions;
}) {
  const t = await getTranslations({ locale, namespace: 'pages.stays' });
  const href = (f: StaysFilters) => `/stays${buildStaysQuery(f)}`;
  const cityName = filters.city ? await localizedCityName(filters.city, locale) : null;
  const nearbyNames = await Promise.all(suggestions.nearby.map((n) => localizedCityName(n.city, locale)));
  const range = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtRange = (a: string, b: string) => range.formatRange(new Date(`${a}T00:00:00Z`), new Date(`${b}T00:00:00Z`));

  const title = filters.guests && suggestions.largest && cityName
    ? t('suggest.titleGuests', { guests: filters.guests, city: cityName })
    : cityName
      ? t('suggest.titleCity', { city: cityName })
      : t('searchEmpty.title');
  const anything = suggestions.largest || suggestions.dates.length || suggestions.nearby.length || suggestions.loosen;

  const group = (label: string, children: React.ReactNode) => (
    <div className="flex flex-col items-center gap-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] rtl:tracking-normal text-mute">{label}</p>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );

  return (
    <div className="px-4 py-16 text-center max-w-2xl mx-auto flex flex-col items-center gap-8">
      <SearchTracker filters={filters} category="all" ids={[]} />
      <div>
        <h2 className="text-lg font-medium text-ink mb-2 tracking-[-0.015em]">{title}</h2>
        <p className="text-ink-soft leading-relaxed">{anything ? t('suggest.body') : t('searchEmpty.body')}</p>
      </div>

      {suggestions.largest && group(
        t('suggest.largestLabel'),
        <Link href={href({ ...filters, guests: suggestions.largest.guests })} className={pill}>
          {t('suggest.largest', { guests: suggestions.largest.guests, count: suggestions.largest.count })}
        </Link>,
      )}

      {suggestions.dates.length > 0 && group(
        t('suggest.datesLabel'),
        suggestions.dates.map((d) => (
          <Link key={d.checkIn} href={href({ ...filters, checkIn: d.checkIn, checkOut: d.checkOut })} className={pill}>
            <span dir="auto">{fmtRange(d.checkIn, d.checkOut)}</span>
            <span className="text-mute">· {t('suggest.places', { count: d.count })}</span>
          </Link>
        )),
      )}

      {suggestions.nearby.length > 0 && group(
        t('suggest.nearbyLabel'),
        suggestions.nearby.map((n, i) => (
          <Link
            key={n.city}
            href={href({ ...filters, city: n.city, district: undefined, area: undefined })}
            className={pill}
          >
            {nearbyNames[i]}
            <span className="text-mute">
              {n.km !== null ? `· ${t('suggest.km', { km: n.km })} ` : ''}· {t('suggest.places', { count: n.count })}
            </span>
          </Link>
        )),
      )}

      {suggestions.loosen !== null && group(
        t('suggest.loosenLabel'),
        <Link href={href({ ...filters, amenities: undefined, priceMin: undefined, priceMax: undefined })} className={pill}>
          {t('suggest.loosen', { count: suggestions.loosen })}
        </Link>,
      )}

      <Link
        href="/stays"
        className="inline-flex items-center gap-1.5 bg-ink text-white rounded-[999px] px-6 py-2.5 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-80"
      >
        {t('searchEmpty.cta')}
      </Link>
    </div>
  );
}
