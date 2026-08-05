import { getTranslations } from 'next-intl/server';
import { CategoryIcon } from './CategoryIcon';
import { Link } from '@/i18n/navigation';
import { getCategoryCounts, type StaysFilters } from '@/lib/queries/stays';
import { STAY_CATEGORIES } from '@/lib/stays/categories';
import { buildStaysQuery } from '@/lib/stays/search-params';

/**
 * The category filter row.
 *
 * WAS: a client component with useState that highlighted a chip and did
 * nothing else — six labels, two of which (HOTELS, FARMS) matched zero units.
 * NOW: plain links to /stays, so a chip both filters and survives a refresh,
 * a shared URL and the back button. No 'use client', no state, no hydration
 * cost on the homepage.
 *
 * A chip renders only when the live catalogue actually holds units of that
 * category — see getCategoryCounts. The active chip is always kept, even at
 * zero, because hiding the filter a guest is currently looking at explains
 * nothing about the empty page in front of them.
 *
 * Existing search state rides along: filtering to Villas after searching
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

export async function CategoryChips({ filters = {} }: CategoryChipsProps) {
  const [t, counts] = await Promise.all([
    getTranslations('categories'),
    getCategoryCounts(),
  ]);

  const active = filters.category;

  const visible = STAY_CATEGORIES.filter(
    ({ key }) => counts[key] > 0 || key === active,
  );

  // Nothing to choose between — one category holding everything is not a
  // filter, it is decoration. Law 2: every element earns its place.
  if (visible.length < 2) return null;

  return (
    /* Outer scroll wrapper — only kicks in on very narrow viewports */
    <div className="overflow-x-auto scrollbar-none px-4 pb-2">
      {/* Inner row — min-w keeps chips from squishing below ~336px,
          mx-auto centers the row on wide screens               */}
      <nav
        aria-label={t('label')}
        className="flex flex-row flex-nowrap items-center justify-evenly min-w-[336px] mx-auto max-w-2xl"
      >
        <Chip
          href={`/stays${buildStaysQuery({ ...filters, category: undefined })}`}
          icon="all"
          label={t('all')}
          active={!active}
        />
        {visible.map(({ key }) => (
          <Chip
            key={key}
            href={`/stays${buildStaysQuery({ ...filters, category: key })}`}
            icon={key}
            label={t(key)}
            active={active === key}
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
      aria-current={active ? 'page' : undefined}
      // py-2.5 + the 28px icon + label clears the 44px touch target.
      className={`flex flex-col items-center gap-1.5 w-14 py-2.5 transition-colors duration-[240ms] ${
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
