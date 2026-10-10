'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import Map, { Layer, NavigationControl, Source, type MapRef } from 'react-map-gl/mapbox';
import type {
  FillLayerSpecification,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from 'mapbox-gl';
// The circle is drawn around the *offset* point (150–350 m from the real one),
// so its 500 m radius always contains the address — never near its centre.
import { APPROX_RADIUS_M } from '@/lib/geo/blur-constants';
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

/** Never closer than this: street level, not building level. */
const MAX_ZOOM = 15;

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

// A neutral grey area, tinted per base map: grey on the street style, a
// white wash on satellite imagery, where grey would disappear. Under the
// labels (the Standard style's "middle" slot).
const SHADE = {
  street: { color: '#6B6B70', fill: 0.2, stroke: 0.55, width: 1 },
  satellite: { color: '#FFFFFF', fill: 0.25, stroke: 0.9, width: 1.5 },
} as const;

const fillLayer = (k: StyleKey): FillLayerSpecification => ({
  id: 'location-radius-fill',
  type: 'fill',
  source: 'location-radius',
  slot: 'middle',
  paint: { 'fill-color': SHADE[k].color, 'fill-opacity': SHADE[k].fill },
});
const strokeLayer = (k: StyleKey): LineLayerSpecification => ({
  id: 'location-radius-stroke',
  type: 'line',
  source: 'location-radius',
  slot: 'middle',
  paint: { 'line-color': SHADE[k].color, 'line-opacity': SHADE[k].stroke, 'line-width': SHADE[k].width },
});

/** Arabic labels need the RTL shaping plugin; registered once, fetched lazily. */
function ensureRtlPlugin(locale: string) {
  if (locale !== 'ar') return;
  try {
    if (mapboxgl.getRTLTextPluginStatus() === 'unavailable') mapboxgl.setRTLTextPlugin(RTL_PLUGIN, null, true);
  } catch { /* already registered */ }
}

/**
 * Interactive map of the unit's approximate area: a grey 500 m circle around
 * the blurred point, and NOTHING at its centre — no pin, no marker, which
 * would read as the address. The point arrives already blurred and rounded
 * from the server. Zoom stops at street level (15). Client-only, loaded when
 * it scrolls into view (see UnitMapSection).
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

  const area = useMemo(() => circleAround(longitude, latitude, APPROX_RADIUS_M), [longitude, latitude]);

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
        maxZoom={MAX_ZOOM}
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
          <Layer {...fillLayer(style)} />
          <Layer {...strokeLayer(style)} />
        </Source>

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
