'use client';

import { useMemo, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl/mapbox';
import type {
  FillLayerSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// mapbox-gl bundles its own GeoJSON types but doesn't re-export FeatureCollection,
// so derive the shape from the source spec rather than pull in @types/geojson.
type GeoJSONData = NonNullable<GeoJSONSourceSpecification['data']>;

interface UnitMapProps {
  latitude: number;
  longitude: number;
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

/** Radius of the approximate-location circle, in metres. */
const RADIUS_M = 300;

/**
 * A circle of `radiusM` around a point, as a GeoJSON polygon.
 *
 * Drawn as a polygon rather than a `circle` layer because a circle layer sizes
 * itself in screen pixels: it would only match 300m at one zoom level and drift
 * at every other. A polygon is defined in real coordinates, so it covers the
 * same ground however far the guest zooms.
 */
function circleAround(longitude: number, latitude: number, radiusM: number): GeoJSONData {
  const STEPS = 64;
  // Degrees per metre; the longitude span narrows as latitude approaches the poles.
  const dLat = radiusM / 110_574;
  const dLon = radiusM / (111_320 * Math.cos((latitude * Math.PI) / 180));

  const ring: [number, number][] = Array.from({ length: STEPS }, (_, i) => {
    const theta = (i / STEPS) * 2 * Math.PI;
    return [longitude + dLon * Math.cos(theta), latitude + dLat * Math.sin(theta)];
  });
  ring.push(ring[0]); // GeoJSON rings must close

  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }],
  };
}

// The shading is tinted per base map: black reads clearly on the light street
// style but disappears into dark satellite imagery, so satellite gets a white
// wash and a firmer outline instead.
const SHADE = {
  street: { color: '#000000', fill: 0.15, stroke: 0.3, width: 1 },
  satellite: { color: '#FFFFFF', fill: 0.25, stroke: 0.9, width: 2 },
} as const;

const fillLayer = (s: StyleKey): FillLayerSpecification => ({
  id: 'location-radius-fill',
  type: 'fill',
  source: 'location-radius',
  paint: { 'fill-color': SHADE[s].color, 'fill-opacity': SHADE[s].fill },
});

const strokeLayer = (s: StyleKey): LineLayerSpecification => ({
  id: 'location-radius-stroke',
  type: 'line',
  source: 'location-radius',
  paint: {
    'line-color': SHADE[s].color,
    'line-opacity': SHADE[s].stroke,
    'line-width': SHADE[s].width,
  },
});

/**
 * Interactive Mapbox map showing the unit's approximate area — a shaded circle
 * over the neighbourhood, with no exact pin. Client-only — mapbox-gl touches
 * `window`, so this is always loaded via a dynamic ssr:false import (see
 * UnitMapSection).
 */
export default function UnitMap({ latitude, longitude, token, labels }: UnitMapProps) {
  const [style, setStyle] = useState<StyleKey>('street');
  const next: StyleKey = style === 'street' ? 'satellite' : 'street';

  const area = useMemo(
    () => circleAround(longitude, latitude, RADIUS_M),
    [longitude, latitude],
  );

  return (
    <Map
      mapboxAccessToken={token}
      initialViewState={{ latitude, longitude, zoom: 13 }} // neighbourhood, not street, level
      mapStyle={STYLES[style]}
      style={{ width: '100%', height: '100%' }}
      // Touch pan/zoom and scroll zoom are on by default; keep rotation off so
      // the map can never end up off-north on a phone.
      dragRotate={false}
      touchPitch={false}
    >
      <Source id="location-radius" type="geojson" data={area}>
        <Layer {...fillLayer(style)} />
        <Layer {...strokeLayer(style)} />
      </Source>

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
