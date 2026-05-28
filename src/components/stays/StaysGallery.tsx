'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { UnitCard } from '@/components/home/UnitCard';
import { MotionCard } from '@/components/motion/MotionCard';
import { staggerContainer } from '@/lib/motion';
import { FILTER_CATEGORY_UNIT_TYPES } from '@/lib/types/unit';
import type { UnitListing, FilterCategory } from '@/lib/types/unit';

interface StaysGalleryProps {
  units: UnitListing[];
}

const FILTER_ORDER: FilterCategory[] = ['all', 'apartment', 'villa', 'cabin', 'hotel', 'farm'];

const CATEGORY_I18N_KEY: Record<FilterCategory, string> = {
  all:       'all',
  apartment: 'apartments',
  villa:     'villas',
  cabin:     'cabins',
  hotel:     'hotels',
  farm:      'farms',
};

export function StaysGallery({ units }: StaysGalleryProps) {
  const tCategories = useTranslations('categories');
  const tPages      = useTranslations('pages.stays');

  const [active, setActive] = useState<FilterCategory>('all');

  const filtered =
    active === 'all'
      ? units
      : units.filter((u) => FILTER_CATEGORY_UNIT_TYPES[active].includes(u.unit_type));

  return (
    <div>
      {/* ── Filter chips ──────────────────────────────────────────────────── */}
      <div
        className="flex gap-2 overflow-x-auto px-4 pb-4 scrollbar-none"
        role="group"
        aria-label="Filter by type"
      >
        {FILTER_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActive(cat)}
            className={cn(
              'shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] rounded-[999px] px-4 py-2 transition-colors duration-[240ms] whitespace-nowrap',
              active === cat
                ? 'bg-ink text-white'
                : 'bg-paper-warm text-mute hover:text-ink-soft'
            )}
          >
            {tCategories(CATEGORY_I18N_KEY[cat])}
          </button>
        ))}
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="px-4 py-16 text-center text-mute text-sm">
          {tPages('noResults')}
        </p>
      ) : (
        <motion.div
          key={active}
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4"
        >
          {filtered.map((unit) => (
            <MotionCard key={unit.id}>
              <UnitCard unit={unit} />
            </MotionCard>
          ))}
        </motion.div>
      )}
    </div>
  );
}
