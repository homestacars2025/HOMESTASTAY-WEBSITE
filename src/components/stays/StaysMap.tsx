'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useRouter } from '@/i18n/navigation';
import { SmartImage } from '@/components/media/SmartImage';
import { loadGoogleMaps } from '@/lib/maps/google';
import { GOOGLE_MAP_ID } from '@/lib/maps/google-style';

/**
 * The /stays results on a Google map — the SAME list the grid shows
 * (StaysBrowser hands it over), never a search of its own.
 *
 *   • every unit is its own price pin, at every zoom — no clustering; a hotel
 *     card is one pin, "from $X"
 *   • pins within a few metres of each other (one building) fan out in a
 *     small ring, so each stays visible and clickable
 *   • desktop: hover a pin → its mini card (and the pin turns brand red and
 *     comes to the front); the card stays while the mouse is on it; a click on
 *     the pin or the card opens the page
 *   • phone: tap a pin → the card slides up at the bottom; tap it to open,
 *     tap the map to close
 *
 * PINS: one AdvancedMarkerElement per unit, its HTML content rendered by
 * React through a portal — Google positions them natively (GPU-composited
 * on the vector map), so panning costs no work of ours per frame. The map is
 * styled by our cloud Map ID ("Homesta"), which advanced markers require.
 *
 * PRIVACY: every point is the blurred, 4-decimal position computed on the
 * server (StayCard.geo). No exact coordinate reaches the browser.
 *
 * Client-only, loaded on demand: StaysBrowser imports it with next/dynamic the
 * first time the map is opened; the Google script itself loads then too.
 */

export interface MapUnit {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** Nightly USD, formatted ("$120"), or null when unpriced. */
  price: string | null;
  /** A hotel / resort card: the pin reads "from $X". */
  from: boolean;
  guests: number | null;
  cover: string | null;
  href: string;
  /** 1-based position in the list, for unit_click. */
  position: number;
}

export type Bounds = [west: number, south: number, east: number, north: number];

interface StaysMapProps {
  units: MapUnit[];
  apiKey: string;
  locale: string;
  /** Changes when the result set changes — the map refits to it. */
  fitKey: string;
  /** The list card under the mouse, lighting its pin. */
  activeId: string | null;
  onActive: (id: string | null) => void;
  /** The guest moved the map themselves (not a refit). */
  onUserMove: (bounds: Bounds) => void;
  labels: { perNight: string; sleeps: (n: number) => string; from: (price: string) => string };
}

const MAX_ZOOM = 16;
/** Pins closer than this (metres) are one spot: they fan out. */
const SAME_SPOT_M = 25;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Screen-pixel offsets that fan out pins sharing one spot (a ring per spot). */
function spreadOffsets(units: MapUnit[]): Map<string, { dx: number; dy: number }> {
  const parent = units.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      if (Math.abs(units[i].lat - units[j].lat) > 0.0005) continue; // cheap pre-check (~55 m)
      if (metres(units[i], units[j]) < SAME_SPOT_M) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  units.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  const out = new Map<string, { dx: number; dy: number }>();
  for (const members of groups.values()) {
    if (members.length === 1) { out.set(units[members[0]].id, { dx: 0, dy: 0 }); continue; }
    const radius = 18 + 5 * members.length;
    members.forEach((m, k) => {
      const a = (k / members.length) * 2 * Math.PI - Math.PI / 2;
      out.set(units[m].id, { dx: Math.round(radius * Math.cos(a)), dy: Math.round(radius * Math.sin(a)) });
    });
  }
  return out;
}

/**
 * The opening view: the results minus far outliers (a mis-pinned unit must
 * not zoom the map out to the whole country). Outliers keep their pin.
 */
function coreBounds(units: MapUnit[]): google.maps.LatLngBounds | null {
  if (!units.length) return null;
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const c = { lat: median(units.map((u) => u.lat)), lng: median(units.map((u) => u.lng)) };
  const d = units.map((u) => metres(u, c) / 1000).sort((a, b) => a - b);
  const limit = Math.max(3, 3 * d[Math.floor(d.length * 0.75)]);
  const core = units.filter((u) => metres(u, c) / 1000 <= limit);
  const b = new google.maps.LatLngBounds();
  for (const u of core.length ? core : units) b.extend({ lat: u.lat, lng: u.lng });
  return b;
}

export default function StaysMap({ units, apiKey, locale, fitKey, activeId, onActive, onUserMove, labels }: StaysMapProps) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markers = useRef(new globalThis.Map<string, { marker: google.maps.marker.AdvancedMarkerElement; el: HTMLDivElement }>());
  const [hosts, setHosts] = useState<{ id: string; el: HTMLDivElement }[]>([]);
  const lastPinTap = useRef(0);
  const [ready, setReady] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tapId, setTapId] = useState<string | null>(null);
  const [canHover, setCanHover] = useState(true);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userMoved = useRef(false);
  const programmatic = useRef(false);
  const onUserMoveRef = useRef(onUserMove);
  onUserMoveRef.current = onUserMove;

  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const rtl = locale === 'ar';

  // ── The map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover)').matches);
    let cancelled = false;
    (async () => {
      await loadGoogleMaps(apiKey, locale);
      const [{ Map }] = await Promise.all([
        google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
        google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
      ]);
      if (cancelled || !box.current) return;
      const map = new Map(box.current, {
        center: { lat: 39.5, lng: 32 },
        zoom: 6,
        maxZoom: MAX_ZOOM,
        // Our cloud style (see lib/maps/google-style) — no local styles array.
        mapId: GOOGLE_MAP_ID,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: rtl ? google.maps.ControlPosition.LEFT_BOTTOM : google.maps.ControlPosition.RIGHT_BOTTOM },
        gestureHandling: 'greedy',
        clickableIcons: false,
      });
      map.addListener('dragstart', () => { userMoved.current = true; });
      map.addListener('zoom_changed', () => { if (!programmatic.current) userMoved.current = true; });
      map.addListener('idle', () => {
        programmatic.current = false;
        if (!userMoved.current) return;
        userMoved.current = false;
        const b = map.getBounds();
        if (b) {
          const ne = b.getNorthEast(), sw = b.getSouthWest();
          onUserMoveRef.current([sw.lng(), sw.lat(), ne.lng(), ne.lat()]);
        }
      });
      // A tap on the map (not on a pin) closes the phone card. A pin tap can
      // bubble to the map as well, so a map click right after one is ignored.
      map.addListener('click', () => { if (Date.now() - lastPinTap.current > 400) setTapId(null); });
      mapRef.current = map;
      setReady(true);
    })().catch(() => { /* the list still works without the map */ });
    const current = markers.current;
    return () => { cancelled = true; for (const { marker } of current.values()) marker.map = null; current.clear(); };
    // The key and language are fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Markers: one per unit, created / moved / removed as the list changes ─
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const offsets = spreadOffsets(units);
    const keep = new Set(units.map((u) => u.id));
    for (const [id, { marker }] of markers.current) {
      if (!keep.has(id)) { marker.map = null; markers.current.delete(id); }
    }
    for (const u of units) {
      const { dx, dy } = offsets.get(u.id) ?? { dx: 0, dy: 0 };
      let entry = markers.current.get(u.id);
      if (!entry) {
        const el = document.createElement('div');
        const marker = new google.maps.marker.AdvancedMarkerElement({ map, content: el, position: { lat: u.lat, lng: u.lng }, zIndex: 1 });
        entry = { marker, el };
        markers.current.set(u.id, entry);
      } else {
        entry.marker.position = { lat: u.lat, lng: u.lng };
      }
      // Centred on the point (not bottom-anchored), plus the fan-out offset.
      entry.el.style.transform = `translate(${dx}px, calc(50% + ${dy}px))`;
    }
    setHosts(units.map((u) => ({ id: u.id, el: markers.current.get(u.id)!.el })));
  }, [units, ready]);

  // The hovered / tapped / list-highlighted pin is drawn on top.
  useEffect(() => {
    for (const [id, { marker }] of markers.current) {
      marker.zIndex = id === hoverId || id === tapId || id === activeId ? 1000 : 1;
    }
  }, [hoverId, tapId, activeId, hosts]);

  // ── Fit to the pins when the result set changes (not when the guest moves) ─
  const lastFit = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    const b = coreBounds(units);
    if (!b) return;
    programmatic.current = true;
    map.fitBounds(b, 56);
  }, [ready, fitKey, units]);

  // A pin that left the results drops its card.
  useEffect(() => {
    if (tapId && !byId.has(tapId)) setTapId(null);
    if (hoverId && !byId.has(hoverId)) setHoverId(null);
  }, [byId, tapId, hoverId]);

  const hoverIn = useCallback((id: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHoverId(id);
    onActive(id);
  }, [onActive]);
  const hoverOut = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // A short grace period: the mouse crossing from the pin to its card.
    closeTimer.current = setTimeout(() => { setHoverId(null); onActive(null); }, 140);
  }, [onActive]);

  function pinClick(u: MapUnit) {
    if (canHover) { router.push(u.href as '/stays'); return; }
    lastPinTap.current = Date.now();
    setTapId((cur) => (cur === u.id ? null : u.id));
  }

  const pinText = (u: MapUnit) => (u.price ? (u.from ? labels.from(u.price) : u.price) : '•');
  const tapped = tapId ? byId.get(tapId) : undefined;

  const card = (u: MapUnit, compact: boolean) => (
    <Link
      href={u.href as '/stays'}
      data-unit={u.id}
      data-pos={u.position}
      data-src="map"
      className={`flex overflow-hidden rounded-[14px] bg-white text-start shadow-[0_8px_28px_rgba(0,0,0,0.18)] ${compact ? 'w-[240px] flex-col' : 'w-full flex-row'}`}
    >
      <span className={`relative block shrink-0 bg-paper-warm ${compact ? 'aspect-[4/3] w-full' : 'h-24 w-28'}`}>
        {u.cover && <SmartImage src={u.cover} alt={u.title} fill sizes="240px" className="object-cover" />}
      </span>
      <span className="block min-w-0 px-3 py-2.5">
        <span className="block text-sm font-semibold leading-snug text-ink line-clamp-2">{u.title}</span>
        <span className="mt-0.5 block text-xs text-mute">
          {u.guests ? `${labels.sleeps(u.guests)} · ` : ''}
          {u.price && (
            <>
              <span className="font-semibold text-stay">{u.from ? labels.from(u.price) : u.price}</span> {labels.perNight}
            </>
          )}
        </span>
      </span>
    </Link>
  );

  return (
    <div className="relative h-full w-full">
      <div ref={box} className="absolute inset-0" />

      {hosts.map(({ id, el }) => {
        const u = byId.get(id);
        if (!u) return null;
        const on = u.id === hoverId || u.id === tapId || u.id === activeId;
        return createPortal(
          <div
            className="relative"
            onMouseEnter={canHover ? () => hoverIn(u.id) : undefined}
            onMouseLeave={canHover ? hoverOut : undefined}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); pinClick(u); }}
              aria-label={`${u.title}${u.price ? ` · ${pinText(u)}` : ''}`}
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums shadow-[0_2px_8px_rgba(0,0,0,0.18)] ring-1 transition-[background-color,color,transform] duration-[240ms] ${
                on ? 'scale-110 bg-stay text-white ring-stay' : 'bg-white text-ink ring-black/10'
              }`}
            >
              {pinText(u)}
            </button>
            {/* Desktop: the card above the hovered pin. Its padding is the
                bridge the mouse crosses without the card closing. */}
            {canHover && u.id === hoverId && (
              <div className="absolute bottom-full start-1/2 -translate-x-1/2 rtl:translate-x-1/2 pb-2">
                {card(u, true)}
              </div>
            )}
          </div>,
          el,
          id,
        );
      })}

      {/* Phone: the tapped unit's card slides up at the bottom. */}
      <div
        className={`pointer-events-none absolute inset-x-3 bottom-3 z-20 transition-transform duration-[240ms] ${tapped ? 'translate-y-0' : 'translate-y-[140%]'}`}
      >
        {tapped && <div className="pointer-events-auto">{card(tapped, false)}</div>}
      </div>
    </div>
  );
}
