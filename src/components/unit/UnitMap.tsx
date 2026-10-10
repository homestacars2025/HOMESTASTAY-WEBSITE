'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl/mapbox';
import type {
  FillLayerSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from 'mapbox-gl';
// The circle is drawn around the *offset* point, so its radius is tied to the
// offset applied in approximateCoords — wide enough to still contain the real
// address, or it would point guests at an area the stay isn't in.
import { APPROX_RADIUS_M } from '@/lib/geo/approximate';
import 'mapbox-gl/dist/mapbox-gl.css';

// mapbox-gl bundles its own GeoJSON types but doesn't re-export FeatureCollection,
// so derive the shape from the source spec rather than pull in @types/geojson.
type GeoJSONData = NonNullable<GeoJSONSourceSpecification['data']>;

export interface UnitMapLabels {
  street: string;
  satellite: string;
  zoomIn: string;
  zoomOut: string;
  attribution: string;
  improve: string;
  map: string;
  scrollHint: string;
}

interface UnitMapProps {
  /** The BLURRED point (approximateCoords, server-side) — never the address. */
  latitude: number;
  longitude: number;
  token: string;
  /** Page locale: map labels follow it (Mapbox localisation; local name as fallback). */
  locale: string;
  labels: UnitMapLabels;
}

/**
 * Mapbox Standard, quietened: the "faded" theme, daylight, no 3D — clean
 * enough to sit beside the photos, and it still names the metro, the malls
 * and the main roads, which is what a guest reads a map for.
 */
const STYLES = {
  street: 'mapbox://styles/mapbox/standard',
  satellite: 'mapbox://styles/mapbox/standard-satellite',
} as const;
type StyleKey = keyof typeof STYLES;

const BASEMAP_CONFIG = {
  basemap: { theme: 'faded', lightPreset: 'day', show3dObjects: false, showPointOfInterestLabels: true, showTransitLabels: true },
};

const STAY = '#E52851';

/**
 * The tinted area drawn on the map. At district zoom (13) the 100 m privacy
 * radius would sit entirely under the house marker, so the area is drawn
 * wider. Wider can only blur MORE: it is centred on the same offset point and
 * still contains the real address (never further than APPROX_RADIUS_M away).
 */
const AREA_RADIUS_M = Math.max(APPROX_RADIUS_M, 400);
const RTL_PLUGIN = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.3.0/mapbox-gl-rtl-text.js';

/**
 * A circle of `radiusM` around a point, as a GeoJSON polygon.
 *
 * Drawn as a polygon rather than a `circle` layer because a circle layer sizes
 * itself in screen pixels: it would only match the radius at one zoom level and
 * drift at every other. A polygon is defined in real coordinates, so it covers
 * the same ground however far the guest zooms.
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

// Brand-tinted area, under the labels (the Standard style's "middle" slot).
const fillLayer: FillLayerSpecification = {
  id: 'location-radius-fill',
  type: 'fill',
  source: 'location-radius',
  slot: 'middle',
  paint: { 'fill-color': STAY, 'fill-opacity': 0.15 },
};
const strokeLayer: LineLayerSpecification = {
  id: 'location-radius-stroke',
  type: 'line',
  source: 'location-radius',
  slot: 'middle',
  paint: { 'line-color': STAY, 'line-opacity': 0.9, 'line-width': 1.5 },
};

/** Arabic labels need the RTL shaping plugin; registered once, fetched lazily. */
function ensureRtlPlugin(locale: string) {
  if (locale !== 'ar') return;
  try {
    if (mapboxgl.getRTLTextPluginStatus() === 'unavailable') mapboxgl.setRTLTextPlugin(RTL_PLUGIN, null, true);
  } catch { /* already registered */ }
}

/**
 * Interactive map of the unit's approximate area — a soft brand-tinted circle
 * with a house marker at its centre. Both sit on the blurred point; there is
 * no exact pin anywhere. Client-only, loaded when it scrolls into view (see
 * UnitMapSection).
 *
 * Opens at district level (zoom 13) so the neighbourhood, metro and malls are
 * in view. +/- and pinch always zoom; the mouse wheel only after the map has
 * been clicked, so scrolling the page past it never zooms it by accident.
 */
export default function UnitMap({ latitude, longitude, token, locale, labels }: UnitMapProps) {
  const [style, setStyle] = useState<StyleKey>('street');
  const [wheel, setWheel] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const next: StyleKey = style === 'street' ? 'satellite' : 'street';

  ensureRtlPlugin(locale);

  const area = useMemo(() => circleAround(longitude, latitude, AREA_RADIUS_M), [longitude, latitude]);

  // Mapbox's own control strings, in the page language.
  const uiStrings = useMemo(() => ({
    'NavigationControl.ZoomIn': labels.zoomIn,
    'NavigationControl.ZoomOut': labels.zoomOut,
    'AttributionControl.ToggleAttribution': labels.attribution,
    'Map.Title': labels.map,
  }), [labels]);

  /**
   * The attribution's "Improve this map" link has no locale key, and Mapbox
   * redraws it whenever it likes (style loads, resizes) — so its text is set
   * again every time the container changes. The © lines are names and stay.
   */
  const localiseAttribution = useCallback(() => {
    const el = mapRef.current?.getContainer().querySelector<HTMLAnchorElement>('.mapbox-improve-map');
    if (el && el.textContent !== labels.improve) el.textContent = labels.improve;
  }, [labels.improve]);

  const observer = useRef<MutationObserver | null>(null);
  const watchAttribution = useCallback(() => {
    const root = mapRef.current?.getContainer();
    if (!root || observer.current) return;
    localiseAttribution();
    observer.current = new MutationObserver(localiseAttribution);
    observer.current.observe(root, { subtree: true, childList: true, characterData: true });
  }, [localiseAttribution]);
  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <div className="relative h-full w-full" onClick={() => !wheel && setWheel(true)}>
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={{ latitude, longitude, zoom: 13 }}
        mapStyle={STYLES[style]}
        // Mapbox-hosted labels in the visitor's language; where a name has no
        // translation Mapbox falls back to the local one. Turkish is the local
        // language here, so 'tr' simply reads the map as published.
        language={locale}
        locale={uiStrings}
        // Standard-style configuration (theme, light, no 3D), passed at creation.
        {...({ config: BASEMAP_CONFIG } as object)}
        style={{ width: '100%', height: '100%' }}
        scrollZoom={wheel}
        // Keep rotation off so the map can never end up off-north on a phone.
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        onLoad={watchAttribution}
        onIdle={localiseAttribution}
      >
        <NavigationControl position={locale === 'ar' ? 'top-left' : 'top-right'} showCompass={false} />

        <Source id="location-radius" type="geojson" data={area}>
          <Layer {...fillLayer} />
          <Layer {...strokeLayer} />
        </Source>

        <Marker longitude={longitude} latitude={latitude} anchor="center">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white ring-2 ring-stay shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke={STAY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
            </svg>
          </span>
        </Marker>
      </Map>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setStyle(next); }}
        // The leading corner — opposite the zoom buttons in both directions.
        className="absolute top-3 start-3 z-10 rounded-full bg-white/95 px-3 py-2 text-xs font-medium text-ink shadow-sm ring-1 ring-rule transition-colors duration-[240ms] hover:bg-paper-warm"
      >
        {labels[next]}
      </button>

      {!wheel && (
        <p className="pointer-events-none absolute bottom-3 inset-x-0 mx-auto w-max max-w-[80%] rounded-full bg-white/90 px-3 py-1 text-[11px] text-ink-soft shadow-sm hidden md:block">
          {labels.scrollHint}
        </p>
      )}
    </div>
  );
}
