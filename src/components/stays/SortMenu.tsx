'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { buildStaysQuery } from '@/lib/stays/search-params';
import { DEFAULT_SORT, SORT_KEYS, isSortKey, type StaysFilters } from '@/lib/stays/filters';

/**
 * Result order. A native <select> — the phone's own picker on mobile, full
 * keyboard support everywhere, and no dropdown code to ship. Changing it
 * rewrites the URL (page reset to 1: page 3 by price is not page 3 by date).
 */
export function SortMenu({ filters }: { filters: StaysFilters }) {
  const t = useTranslations('filters.sort');
  const router = useRouter();
  const value = filters.sort ?? DEFAULT_SORT;

  return (
    <label className="relative inline-flex items-center h-11 rounded-full border border-rule ps-4 pe-9 text-sm text-ink hover:border-ink-soft transition-colors duration-[240ms] focus-within:border-ink">
      <span className="sr-only">{t('label')}</span>
      <select
        value={value}
        onChange={(e) => {
          const sort = e.target.value;
          if (!isSortKey(sort)) return;
          const next = { ...filters, sort: sort === DEFAULT_SORT ? undefined : sort };
          router.push(`/stays${buildStaysQuery(next)}` as '/stays');
        }}
        className="appearance-none bg-transparent font-medium cursor-pointer focus:outline-none"
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {t(key)}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-3 w-4 h-4 text-mute"
        aria-hidden="true"
      />
    </label>
  );
}
