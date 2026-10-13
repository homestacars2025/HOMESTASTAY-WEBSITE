'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
// Advanced markers (our badge and pins) need the cloud Map ID; no ID, no map.
const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

/** The same footprint as the loaded map + chips, so nothing shifts when it arrives. */
function Placeholder() {
  return (
    <div aria-hidden="true">
      <div className="mb-2 h-[14px] w-28 rounded bg-paper-warm" />
      <div className="mb-3 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-11 w-28 shrink-0 rounded-[999px] bg-paper-warm" />)}
      </div>
      <div className="h-[300px] md:h-[420px] w-full rounded-[14px] border border-rule bg-paper-warm" />
    </div>
  );
}

// Google Maps never renders on the server, and its code (and the Maps script)
// only load once this section nears the viewport.
const UnitGoogleMap = dynamic(() => import('./UnitGoogleMap'), { ssr: false, loading: Placeholder });

export function UnitMapSection({
  unitId,
  latitude,
  longitude,
  locale,
}: {
  unitId: string;
  /** The blurred point (approximateCoords) — never the address. */
  latitude: number | null;
  longitude: number | null;
  locale: string;
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

  if (latitude == null || longitude == null || !GOOGLE_MAPS_KEY || !GOOGLE_MAP_ID) return null;

  return (
    <div ref={box}>
      {near ? (
        <UnitGoogleMap
          unitId={unitId}
          latitude={latitude}
          longitude={longitude}
          apiKey={GOOGLE_MAPS_KEY}
          locale={locale}
        />
      ) : (
        <Placeholder />
      )}
    </div>
  );
}
