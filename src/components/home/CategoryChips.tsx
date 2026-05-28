'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CategoryIcon } from './CategoryIcon';

const CATEGORIES = [
  'all',
  'apartments',
  'villas',
  'cabins',
  'hotels',
  'farms',
] as const;

type Category = (typeof CATEGORIES)[number];

export function CategoryChips() {
  const t = useTranslations('categories');
  const [active, setActive] = useState<Category>('all');

  return (
    /* Outer scroll wrapper — only kicks in on very narrow viewports */
    <div className="overflow-x-auto scrollbar-none px-4 pb-2">
      {/* Inner row — min-w keeps chips from squishing below ~336px,
          mx-auto centers the row on wide screens               */}
      <div className="flex flex-row flex-nowrap items-center justify-evenly min-w-[336px] mx-auto max-w-2xl">
        {CATEGORIES.map((cat) => {
          const isActive = active === cat;
          return (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={`flex flex-col items-center gap-1.5 w-14 py-2.5 transition-colors duration-[240ms] ${
                isActive ? 'text-stay' : 'text-mute hover:text-ink'
              }`}
            >
              <CategoryIcon name={cat} size={28} />
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.09em] leading-none whitespace-nowrap ${
                  isActive ? 'font-medium' : 'font-normal'
                }`}
              >
                {t(cat)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
