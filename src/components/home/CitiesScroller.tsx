'use client';

import { SmartImage } from '@/components/media/SmartImage';
import { motion } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { cityCardHover, cardImageHover } from '@/lib/motion';
import type { CityData } from '@/lib/data/cities';

/** A city plus the destination slug resolved server-side in CitiesRow. */
export type LinkedCity = CityData & { slug: string };

interface CitiesScrollerProps {
  cities: LinkedCity[];
}

// Renders the city card scroll strip with hover lift + image zoom.
// Data is fetched server-side in CitiesRow and passed down.
export function CitiesScroller({ cities }: CitiesScrollerProps) {
  return (
    <div
      className="flex gap-3 overflow-x-auto px-4 pb-3 scrollbar-none"
      style={{ scrollSnapType: 'x mandatory' }}
    >
      {cities.map((city) => (
        <motion.div
          key={city.id}
          variants={cityCardHover}
          initial="rest"
          animate="rest"
          whileHover="hover"
          className="shrink-0 w-36 md:w-44"
          style={{ scrollSnapAlign: 'start' }}
        >
          {/* Was /stays?city=… — a filtered view of the index, which
              canonicalises straight back to /stays and so could never be
              indexed as a city page. Now points at the real destination page. */}
          <Link href={`/destinations/${city.slug}`} className="block">
            <div className="relative w-full aspect-[3/4] rounded-[14px] overflow-hidden">
              {city.imageUrl ? (
                <motion.div variants={cardImageHover} className="absolute inset-0">
                  <SmartImage
                    src={city.imageUrl}
                    alt={city.name}
                    fill
                    sizes="(min-width: 768px) 176px, 144px"
                    className="object-cover"
                    loading="lazy"
                  />
                </motion.div>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[--paper-warm] to-[--paper-cool]" />
              )}

              {/* Readability gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

              <span className="absolute bottom-0 inset-x-0 px-3 pb-3 text-white text-sm font-medium">
                {city.name}
              </span>
            </div>
          </Link>
        </motion.div>
      ))}

      <div className="w-1 shrink-0" aria-hidden="true" />
    </div>
  );
}
