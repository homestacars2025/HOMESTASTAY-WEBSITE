'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { UnitCard } from '@/components/home/UnitCard';
import { MotionCard } from '@/components/motion/MotionCard';
import { staggerContainer } from '@/lib/motion';
import type { UnitListing } from '@/lib/types/unit';

/**
 * The results grid.
 *
 * IT NO LONGER FILTERS. A second, client-side type filter used to live here as
 * a row of pills, duplicating the icon row above it — and it was the worse of
 * the two in every respect: it filtered only the 24 units on the CURRENT page
 * rather than the whole result set, it did not survive a refresh or a shared
 * link, and it offered Hotels and Farms, which the catalogue holds none of.
 * Filtering belongs to the URL, where CategoryChips puts it.
 */

interface StaysGalleryProps {
  units: UnitListing[];
  /** Passed straight to each card's link so the current search dates/guests
   *  survive the click into the unit page. */
  searchQuery?: string;
}

export function StaysGallery({ units, searchQuery }: StaysGalleryProps) {
  const tPages = useTranslations('pages.stays');

  if (units.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-mute text-sm">
        {tPages('noResults')}
      </p>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4"
    >
      {units.map((unit) => (
        <MotionCard key={unit.id}>
          <UnitCard unit={unit} searchQuery={searchQuery} />
        </MotionCard>
      ))}
    </motion.div>
  );
}
