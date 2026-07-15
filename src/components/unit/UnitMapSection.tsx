'use client';

import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';

// mapbox-gl must never render on the server (it reads `window`), so the map is
// loaded client-side only. A "use client" boundary is required for ssr:false.
const UnitMap = dynamic(() => import('./UnitMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper-warm animate-pulse" />,
});

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface UnitMapSectionProps {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  title: string;
  labels: {
    whereYoullBe: string;
    exactLocationNote: string;
    street: string;
    satellite: string;
  };
}

export function UnitMapSection({
  latitude,
  longitude,
  city,
  country,
  title,
  labels,
}: UnitMapSectionProps) {
  // No coordinates → no section at all (do not render an empty map).
  if (latitude == null || longitude == null) return null;
  // No token → Mapbox would paint a broken grey box, so hide the section too.
  if (!MAPBOX_TOKEN) return null;

  const place = [city, country].filter(Boolean).join(', ');

  return (
    <section aria-labelledby="where-heading">
      <h2
        id="where-heading"
        className="text-base font-medium text-ink mb-1 tracking-[-0.015em]"
      >
        {labels.whereYoullBe}
      </h2>

      {place && (
        <p className="flex items-center gap-2 text-sm text-ink-soft mb-4">
          <MapPin className="w-[18px] h-[18px] text-mute shrink-0" />
          {place}
        </p>
      )}

      {/* Fixed aspect box reserves space before the map loads (no layout shift). */}
      <div className="relative h-[280px] md:h-[400px] w-full rounded-[14px] overflow-hidden border border-rule">
        <UnitMap
          latitude={latitude}
          longitude={longitude}
          title={title}
          token={MAPBOX_TOKEN}
          labels={{ street: labels.street, satellite: labels.satellite }}
        />
      </div>

      <p className="mt-3 text-xs text-mute italic">{labels.exactLocationNote}</p>
    </section>
  );
}
