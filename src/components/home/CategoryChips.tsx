import { getTranslations } from 'next-intl/server';
import { CategoryIcon } from './CategoryIcon';
import { Link } from '@/i18n/navigation';
import { getCatalogueFacets, type StaysFilters } from '@/lib/queries/stays';
import { STAY_TYPES, type StayType } from '@/lib/stays/filters';
import { buildStaysQuery } from '@/lib/stays/search-params';

/**
 * The unit-type filter row — one chip per raw unit_type, plus ALL.
 *
 * Plain links to /stays, so a chip both filters and survives a refresh, a
 * shared URL and the back button. No 'use client', no state, no hydration cost
 * on the homepage.
 *
 * Chips toggle: tapping Villa while Apartment is on shows both (unit_type IN
 * (...)); tapping an active chip takes it back off; ALL clears the lot.
 *
 * A chip renders only when the live catalogue holds units of that type — see
 * getCatalogueFacets — so farm and bed stay hidden until the first one is
 * listed. An active chip is always kept, even at zero, because hiding the
 * filter a guest is currently looking at explains nothing about the empty
 * page in front of them.
 *
 * Existing search state rides along: filtering to villas after searching
 * Istanbul keeps ?city=istanbul, so the two AND together. `page` is
 * deliberately dropped — page 4 of apartments is not page 4 of villas.
 */

interface CategoryChipsProps {
  /**
   * Current /stays filters, so a chip preserves the active search.
   * Omitted on the homepage, where there is no search to preserve.
   */
  filters?: StaysFilters;
}

/** English floor for a missing message — see `label` below. */
const FALLBACK: Record<StayType, string> = {
  apartment: 'Apartment', villa: 'Villa', studio: 'Studio', suite: 'Suite', room: 'Room',
  cabin: 'Cabin', farm: 'Farm', bed: 'Bed', other: 'Place',
};

export async function CategoryChips({ filters = {} }: CategoryChipsProps) {
  const [t, { typeCounts }] = await Promise.all([
    getTranslations('categories'),
    getCatalogueFacets(),
  ]);

  const active = new Set(filters.types ?? []);

  const visible = STAY_TYPES.filter((type) => typeCounts[type] > 0 || active.has(type));

  /**
   * A label that can never be a raw key.
   *
   * next-intl renders the key path for a missing message, which is exactly how
   * "CATEGORIES.FARMS" reached production. Every key here exists in all four
   * locales today; this makes that a fact the code enforces rather than one it
   * assumes.
   */
  const label = (key: string, fallback: string): string =>
    typeof t.has === 'function' && !t.has(key) ? fallback : t(key);

  /** The same search with `type` switched on or off. */
  const toggled = (type: StayType): string => {
    const next = new Set(active);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    const types = STAY_TYPES.filter((x) => next.has(x));
    return `/stays${buildStaysQuery({ ...filters, types: types.length ? types : undefined })}`;
  };

  // Nothing to choose between — one type holding everything is not a
  // filter, it is decoration. Law 2: every element earns its place.
  if (visible.length < 2) return null;

  return (
    /* Scrolls sideways on a phone (eight chips do not fit 375px); centred
       once there is room for the whole row. */
    <div className="overflow-x-auto scrollbar-none px-4 pb-2">
      <nav
        aria-label={t('label')}
        className="flex flex-row flex-nowrap items-center gap-1 sm:gap-3 w-max mx-auto"
      >
        <Chip
          href={`/stays${buildStaysQuery({ ...filters, types: undefined })}`}
          icon="all"
          label={label('all', 'All')}
          active={active.size === 0}
        />
        {visible.map((type) => (
          <Chip
            key={type}
            href={toggled(type)}
            icon={type}
            label={label(type, FALLBACK[type])}
            active={active.has(type)}
          />
        ))}
      </nav>
    </div>
  );
}

function Chip({
  href, icon, label, active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      // py-2.5 + the 28px icon + label clears the 44px touch target.
      className={`flex flex-col items-center gap-1.5 min-w-14 px-1.5 py-2.5 transition-colors duration-[240ms] ${
        active ? 'text-stay' : 'text-mute hover:text-ink'
      }`}
    >
      <CategoryIcon name={icon} size={28} />
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.09em] leading-none whitespace-nowrap ${
          active ? 'font-medium' : 'font-normal'
        }`}
      >
        {label}
      </span>
    </Link>
  );
}
