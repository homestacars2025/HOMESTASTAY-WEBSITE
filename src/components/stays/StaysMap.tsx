'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from 'react-map-gl/mapbox';
import type { CircleLayerSpecification, GeoJSONSource, SymbolLayerSpecification } from 'mapbox-gl';
import { Link } from '@/i18n/navigation';
import { SmartImage } from '@/components/media/SmartImage';
import 'mapbox-gl/dist/mapbox-gl.css';

/**
 * The /stays results on a map — the SAME list the grid shows (StaysBrowser
 * hands it over), never a search of its own.
 *
 *   • zoomed out: clusters (Mapbox's own clustering on the GeoJSON source)
 *   • zoomed in: a price pill per unit (DOM markers for the unclustered points
 *     only, so a 300-unit city never puts 300 nodes on screen)
 *   • a pill opens a mini card → the unit page
 *
 * PRIVACY: every point is the unit page's blurred position (20–50 m off,
 * 4 decimals), computed on the server (StayCard.geo). No exact coordinate
 * reaches here.
 *
 * Client-only and loaded on demand: StaysBrowser imports it with
 * next/dynamic (ssr: false) the first time the map is opened.
 */

export interface MapUnit {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** Nightly USD, already formatted ("$120"), or null when unpriced. */
  price: string | null;
  guests: number | null;
  cover: string | null;
  href: string;
  /** 1-based position in the list, for unit_click. */
  position: number;
}

export type Bounds = [west: number, south: number, east: number, north: number];

interface StaysMapProps {
  units: MapUnit[];
  token: string;
  /** Changes when the result set changes — the map refits to it. */
  fitKey: string;
  activeId: string | null;
  onActive: (id: string | null) => void;
  /** The guest moved the map themselves (not a refit). */
  onUserMove: (bounds: Bounds) => void;
  rtl: boolean;
  labels: { perNight: string; sleeps: (n: number) => string; close: string };
}

const SOURCE = 'stays';

const clusterLayer: CircleLayerSpecification = {
  id: 'stays-clusters',
  type: 'circle',
  source: SOURCE,
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#0E0E10',
    'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 25],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#FFFFFF',
  },
};

const clusterCountLayer: SymbolLayerSpecification = {
  id: 'stays-cluster-count',
  type: 'symbol',
  source: SOURCE,
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 12,
    'text-allow-overlap': true,
  },
  paint: { 'text-color': '#FFFFFF' },
};

/**
 * The box to open on: the results, minus far outliers. One unit with a wrong
 * pin (an Istanbul listing pinned near Çorum) would otherwise zoom the map
 * out to half the country. Outliers keep their pin; they just do not decide
 * the first view. Kept: within 3× the 75th-percentile distance from the
 * median point (at least 3 km).
 */
function boundsOf(units: MapUnit[]): [[number, number], [number, number]] | null {
  if (!units.length) return null;
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const c = { lat: median(units.map((u) => u.lat)), lng: median(units.map((u) => u.lng)) };
  const km = (u: MapUnit) => {
    const dy = (u.lat - c.lat) * 111;
    const dx = (u.lng - c.lng) * 111 * Math.cos((c.lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  };
  const d = units.map(km).sort((a, b) => a - b);
  const limit = Math.max(3, 3 * d[Math.floor(d.length * 0.75)]);
  const core = units.filter((u) => km(u) <= limit);
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const u of core.length ? core : units) {
    w = Math.min(w, u.lng); e = Math.max(e, u.lng);
    s = Math.min(s, u.lat); n = Math.max(n, u.lat);
  }
  return [[w, s], [e, n]];
}

export default function StaysMap({ units, token, fitKey, activeId, onActive, onUserMove, rtl, labels }: StaysMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  const byId = useMemo(() => new globalThis.Map(units.map((u) => [u.id, u])), [units]);

  const data = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: units.map((u) => ({
      type: 'Feature' as const,
      properties: { id: u.id },
      geometry: { type: 'Point' as const, coordinates: [u.lng, u.lat] },
    })),
  }), [units]);

  /** Which points are NOT inside a cluster right now — those get a price pill. */
  const refreshPins = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.getSource(SOURCE)) return;
    const ids = new Set(
      map.querySourceFeatures(SOURCE, { filter: ['!', ['has', 'point_count']] })
        .map((f) => String(f.properties?.id)),
    );
    setVisible((prev) => (prev.size === ids.size && [...ids].every((id) => prev.has(id)) ? prev : ids));
  }, []);

  const fit = useCallback((animate: boolean) => {
    const map = mapRef.current;
    const b = boundsOf(units);
    if (!map || !b) return;
    if (b[0][0] === b[1][0] && b[0][1] === b[1][1]) {
      map.jumpTo({ center: b[0], zoom: 13 });
      return;
    }
    map.fitBounds(b, { padding: 56, maxZoom: 14, duration: animate ? 400 : 0 });
  }, [units]);

  // Refit when the result set changes (a chip, a new search) — not on every
  // render, and never because the guest moved the map.
  const lastFit = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || lastFit.current === fitKey) return;
    fit(lastFit.current !== null);
    lastFit.current = fitKey;
  }, [loaded, fitKey, fit]);

  // A selected unit that left the results closes its card.
  useEffect(() => {
    if (selected && !byId.has(selected)) setSelected(null);
  }, [selected, byId]);

  function onClusterClick(e: MapMouseEvent) {
    const feature = e.features?.[0];
    const map = mapRef.current?.getMap();
    if (!feature || !map) return;
    const clusterId = feature.properties?.cluster_id as number;
    const source = map.getSource(SOURCE) as GeoJSONSource;
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err || zoom == null) return;
      const [lng, lat] = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates;
      map.easeTo({ center: [lng, lat], zoom, duration: 400 });
    });
  }

  function onMoveEnd(e: ViewStateChangeEvent) {
    refreshPins();
    // A refit has no originalEvent; a drag, pinch or wheel does. (Present at
    // runtime on mapbox-gl's moveend, missing from its event typing.)
    if (!(e as unknown as { originalEvent?: Event }).originalEvent) return;
    const b = mapRef.current?.getBounds();
    if (b) onUserMove([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }

  const sel = selected ? byId.get(selected) : undefined;

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={token}
      initialViewState={{ longitude: 29, latitude: 39.5, zoom: 5 }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: '100%', height: '100%' }}
      // Pins are blurred points (20–50 m off); the same zoom limit as the unit map.
      maxZoom={16}
      dragRotate={false}
      touchPitch={false}
      interactiveLayerIds={['stays-clusters']}
      onClick={onClusterClick}
      onLoad={() => { setLoaded(true); }}
      onMoveEnd={onMoveEnd}
      onIdle={refreshPins}
    >
      <NavigationControl position={rtl ? 'top-left' : 'top-right'} showCompass={false} />

      <Source id={SOURCE} type="geojson" data={data} cluster clusterMaxZoom={13} clusterRadius={48}>
        <Layer {...clusterLayer} />
        <Layer {...clusterCountLayer} />
      </Source>

      {units.filter((u) => visible.has(u.id)).map((u) => {
        const on = u.id === activeId || u.id === selected;
        return (
          <Marker
            key={u.id}
            longitude={u.lng}
            latitude={u.lat}
            anchor="bottom"
            style={{ zIndex: on ? 2 : 1 }}
            onClick={(e) => { e.originalEvent.stopPropagation(); setSelected(u.id); }}
          >
            <button
              type="button"
              onMouseEnter={() => onActive(u.id)}
              onMouseLeave={() => onActive(null)}
              aria-label={`${u.title}${u.price ? ` · ${u.price}` : ''}`}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums shadow-[0_2px_8px_rgba(0,0,0,0.18)] ring-1 ring-black/10 transition-[background-color,color,transform] duration-[240ms] ${
                on ? 'bg-ink text-white scale-110' : 'bg-white text-ink hover:scale-105'
              }`}
            >
              {u.price ?? '•'}
            </button>
          </Marker>
        );
      })}

      {sel && (
        <Popup
          longitude={sel.lng}
          latitude={sel.lat}
          anchor="bottom"
          offset={34}
          closeButton={false}
          closeOnClick
          onClose={() => setSelected(null)}
          maxWidth="260px"
          className="hs-map-popup"
        >
          <Link
            href={sel.href as '/stays/[slug]'}
            data-unit={sel.id}
            data-pos={sel.position}
            data-src="map"
            className="block w-[240px] text-start"
          >
            <div className="relative aspect-[4/3] bg-paper-warm">
              {sel.cover && (
                <SmartImage src={sel.cover} alt={sel.title} fill sizes="240px" className="object-cover" />
              )}
            </div>
            <div className="px-3 py-2.5">
              <p className="text-sm font-semibold text-ink leading-snug line-clamp-1">{sel.title}</p>
              <p className="mt-0.5 text-xs text-mute">
                {sel.guests ? `${labels.sleeps(sel.guests)} · ` : ''}
                {sel.price && (
                  <>
                    <span className="font-semibold text-stay">{sel.price}</span> {labels.perNight}
                  </>
                )}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label={labels.close}
            className="absolute top-2 end-2 w-7 h-7 rounded-full bg-white/90 text-ink text-sm leading-none shadow-sm"
          >
            ×
          </button>
        </Popup>
      )}
    </Map>
  );
}
