'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { UnitMapLabels } from './UnitMap';

// mapbox-gl must never render on the server (it reads `window`), so the map is
// loaded client-side only — and only once its box nears the viewport, so the
// map code costs nothing to a guest who never scrolls this far.
const UnitMap = dynamic(() => import('./UnitMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper-warm animate-pulse" />,
});

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/**
 * The map box. Fixed height reserves the space before anything loads (no
 * layout shift); the map itself mounts when the box comes within 300px of the
 * viewport. Renders nothing without coordinates or a token.
 */
export function UnitMapSection({
  latitude,
  longitude,
  locale,
  labels,
}: {
  /** The blurred point (approximateCoords) — never the address. */
  latitude: number | null;
  longitude: number | null;
  locale: string;
  labels: UnitMapLabels;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  if (latitude == null || longitude == null || !MAPBOX_TOKEN) return null;

  return (
    <div ref={box} className="relative h-[300px] md:h-[420px] w-full rounded-[14px] overflow-hidden border border-rule bg-paper-warm">
      {near && (
        <UnitMap latitude={latitude} longitude={longitude} token={MAPBOX_TOKEN} locale={locale} labels={labels} />
      )}
    </div>
  );
}
