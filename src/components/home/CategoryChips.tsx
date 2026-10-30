import { getTranslations } from 'next-intl/server';
import { getCatalogueFacets, getPropertyIndex } from '@/lib/queries/stays';
import { CATEGORIES, CATEGORY_TYPES } from '@/lib/stays/categories';
import { CategoryRow, type ChipItem } from '@/components/stays/CategoryRow';

/**
 * The homepage chip row: All · Apartment · Cabin · Villa · Hotels · Cars.
 * Each chip links to /stays?type=…, where the same row filters in place.
 *
 * A category chip renders only when the live catalogue holds bookable units of
 * its types (getCatalogueFacets, cached and tagged 'units') — Hotels when there
 * is a hotel / resort / aparthotel to show (getPropertyIndex). No 'use client',
 * no state — plain links, no hydration cost on the homepage beyond the row.
 */
export async function CategoryChips() {
  const [t, { typeCounts }, properties] = await Promise.all([
    getTranslations('categories'),
    getCatalogueFacets(),
    getPropertyIndex(),
  ]);
  const hotels = Object.values(properties).filter((p) => p.showAsProperty).length;

  const items: ChipItem[] = [{ key: 'all', label: t('all'), href: '/stays' }];
  for (const c of CATEGORIES) {
    const count = c === 'hotels'
      ? hotels
      : CATEGORY_TYPES[c].reduce((sum, type) => sum + (typeCounts[type] ?? 0), 0);
    if (count > 0) items.push({ key: c, label: t(c), href: `/stays?type=${c}` });
  }
  // One category holding everything is not a filter, it is decoration.
  if (items.length < 3) return null;

  return (
    <CategoryRow
      items={items}
      active="all"
      ariaLabel={t('label')}
      carsLabel={t('cars')}
      newTabLabel={t('newTab')}
    />
  );
}
