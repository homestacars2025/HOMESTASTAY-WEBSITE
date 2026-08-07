'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Search, SlidersHorizontal } from 'lucide-react';
import { SearchBar, type SearchBarProps } from '@/components/home/SearchBar';

/**
 * The search bar, collapsed into a summary once a search has run.
 *
 * WHY: after searching, the full three-field bar is the largest thing on the
 * page and it is answering a question the guest already answered. Every large
 * travel site collapses it for the same reason — the results are the content,
 * the search is now context. Tapping the summary brings the full bar back.
 *
 * Collapsed by default ONLY on a page that already has a search behind it
 * (/stays with filters). The homepage always renders expanded: there, the
 * search IS the content.
 *
 * The summary is built from the same values that pre-fill the bar, so the two
 * can never disagree about what was searched.
 */

interface CollapsibleSearchProps extends SearchBarProps {
  /** True on /stays once a search has run. */
  startCollapsed?: boolean;
}

export function CollapsibleSearch({
  cities,
  initial,
  startCollapsed = false,
}: CollapsibleSearchProps) {
  const t = useTranslations('search');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(!startCollapsed);

  const city = cities.find((c) => c.id === initial?.cityId);
  const guests = initial?.guests ?? 1;
  const from = initial?.dateRange?.from;
  const to = initial?.dateRange?.to;

  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
  });

  // Only what was actually chosen. Padding the summary with "Any dates" and
  // "1 guest" would make three fields look answered when one was.
  const parts = [
    city?.localizedName,
    from ? (to ? `${dateFmt.format(from)} – ${dateFmt.format(to)}` : dateFmt.format(from)) : null,
    guests > 1 ? t('guestCount', { count: guests }) : null,
  ].filter(Boolean) as string[];

  return (
    <AnimatePresence mode="wait" initial={false}>
      {expanded ? (
        <motion.div
          key="full"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          // 240ms, the brand's "slow exhale". Nothing here snaps.
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          <SearchBar cities={cities} initial={initial} />
        </motion.div>
      ) : (
        <motion.div
          key="summary"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="flex justify-center"
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('editSearch')}
            className="group w-full md:w-auto md:min-w-[420px] flex items-center gap-3 bg-white rounded-[999px] border border-rule shadow-[0_2px_16px_rgba(0,0,0,0.06)] ps-5 pe-2 py-2 min-h-[44px] transition-shadow duration-[240ms] hover:shadow-[0_4px_24px_rgba(0,0,0,0.10)]"
          >
            <Search className="w-4 h-4 text-stay shrink-0" aria-hidden />
            <span className="flex-1 min-w-0 text-start">
              <span className="block text-sm text-ink truncate">
                {/* Separated by a middot rather than commas — it reads as one
                    line of context, not a sentence. */}
                {parts.length > 0 ? parts.join(' · ') : t('cta')}
              </span>
            </span>
            <span className="shrink-0 flex items-center gap-1.5 rounded-[999px] bg-paper-warm px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft transition-colors duration-[240ms] group-hover:text-ink">
              <SlidersHorizontal className="w-3 h-3" aria-hidden />
              {t('editSearch')}
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
