'use client';

import { useState } from 'react';
import Map, { Marker } from 'react-map-gl/mapbox';
import { BrandMark } from '@/components/brand/BrandMark';
import 'mapbox-gl/dist/mapbox-gl.css';

interface UnitMapProps {
  latitude: number;
  longitude: number;
  /** Accessible marker label (unit title / city). */
  title: string;
  token: string;
  labels: {
    street: string;
    satellite: string;
  };
}

const STYLES = {
  street: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
} as const;

type StyleKey = keyof typeof STYLES;

/**
 * Interactive Mapbox map centered on the unit's coordinates. Client-only —
 * mapbox-gl touches `window`, so this is always loaded via a dynamic ssr:false
 * import (see UnitMapSection).
 */
export default function UnitMap({ latitude, longitude, title, token, labels }: UnitMapProps) {
  const [style, setStyle] = useState<StyleKey>('street');
  const next: StyleKey = style === 'street' ? 'satellite' : 'street';

  return (
    <Map
      mapboxAccessToken={token}
      initialViewState={{ latitude, longitude, zoom: 14 }} // neighborhood level, matching Airbnb
      mapStyle={STYLES[style]}
      style={{ width: '100%', height: '100%' }}
      // Touch pan/zoom and scroll zoom are on by default; keep rotation off so
      // the map can never end up off-north on a phone.
      dragRotate={false}
      touchPitch={false}
    >
      <Marker latitude={latitude} longitude={longitude} anchor="center">
        {/* White disc carrying the Homesta arch mark — not Mapbox's default
            teardrop pin. BrandMark is inline SVG inheriting currentColor, so
            the mark stays crisp at any zoom and costs no extra request. */}
        <div
          role="img"
          aria-label={title}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white p-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
        >
          <BrandMark className="h-full w-full text-stay" />
        </div>
      </Marker>

      <button
        type="button"
        onClick={() => setStyle(next)}
        // inset-inline-end keeps the control on the trailing edge in Arabic too.
        className="absolute end-3 top-3 z-10 rounded-full bg-white/95 px-3 py-2 text-xs font-medium text-ink shadow-sm ring-1 ring-rule transition-colors duration-240 hover:bg-paper-warm"
      >
        {labels[next]}
      </button>
    </Map>
  );
}
