'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  Banknote, Cross, Pill, ShoppingBag, ShoppingCart, TrainFront, UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { loadGoogleMaps } from '@/lib/maps/google';
import { APPROX_RADIUS_M } from '@/lib/geo/blur-constants';

/**
 * The unit page map (Google Maps JS) and "What's nearby".
 *
 * PRIVACY — unchanged: the point arrives already blurred on the server (20–50 m
 * off, 4 decimals). The map draws a grey 80 m circle around it (never under
 * 28 px across) and NOTHING at its centre. Max zoom 16.
 *
 * NEARBY: a chip tap runs ONE Places (New) Nearby Search from the browser,
 * centred on the blurred point, 1 km, 8 results, and only the fields shown
 * (id, displayName, primaryType, location, photos). Nothing is requested on
 * page load; results are kept in memory per unit + category for the session.
 */

export type NearbyCategory = 'supermarket' | 'transit' | 'restaurant' | 'pharmacy' | 'hospital' | 'mall' | 'mosque' | 'atm';

export const NEARBY_CATEGORIES: NearbyCategory[] = ['supermarket', 'transit', 'restaurant', 'pharmacy', 'hospital', 'mall', 'mosque', 'atm'];

const TYPES: Record<NearbyCategory, string[]> = {
  supermarket: ['supermarket', 'grocery_store'],
  transit: ['subway_station', 'light_rail_station', 'train_station', 'transit_station'],
  restaurant: ['restaurant'],
  pharmacy: ['pharmacy'],
  hospital: ['hospital'],
  mall: ['shopping_mall'],
  mosque: ['mosque'],
  atm: ['atm'],
};

/** A small mosque (dome + minaret) — lucide has none. */
const MosqueIcon = (({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 21V11M4 7v4M4 7l0-3" />
    <path d="M8 21v-5a5 5 0 0 1 10 0v5" />
    <path d="M13 11V9" />
    <path d="M2 21h20" />
  </svg>
)) as unknown as LucideIcon;

export const CATEGORY_ICON: Record<NearbyCategory, LucideIcon> = {
  supermarket: ShoppingCart,
  transit: TrainFront,
  restaurant: UtensilsCrossed,
  pharmacy: Pill,
  hospital: Cross,
  mall: ShoppingBag,
  mosque: MosqueIcon,
  atm: Banknote,
};

interface NearbyPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  metres: number;
  photo: string | null;
}

// Session cache: unit + category → results. Survives client navigation.
const cache = new Map<string, NearbyPlace[]>();

const START_ZOOM = 14;
const MAX_ZOOM = 16;
const MIN_DIAMETER_PX = 28;
const SEARCH_RADIUS_M = 1000;

/** Clean, light base map: muted colours, labels kept, business clutter thinned. */
const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ saturation: -35 }, { lightness: 8 }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -60 }, { lightness: 20 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ saturation: -20 }, { lightness: 15 }] },
];

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export default function UnitGoogleMap({
  unitId,
  latitude,
  longitude,
  apiKey,
  locale,
}: {
  unitId: string;
  /** The BLURRED point (server-side approximateCoords) — never the address. */
  latitude: number;
  longitude: number;
  apiKey: string;
  locale: string;
}) {
  const t = useTranslations('unit.nearby');
  const tUnit = useTranslations('unit');
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlays = useRef<google.maps.OverlayView[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [category, setCategory] = useState<NearbyCategory | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [selected, setSelected] = useState<string | null>(null);
  const [pinHosts, setPinHosts] = useState<{ id: string; el: HTMLDivElement }[]>([]);
  const rtl = locale === 'ar';
  const center = { lat: latitude, lng: longitude };

  // ── The map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps(apiKey, locale);
        const { Map, Circle } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        if (cancelled || !box.current) return;
        const map = new Map(box.current, {
          center: { lat: latitude, lng: longitude },
          zoom: START_ZOOM,
          maxZoom: MAX_ZOOM,
          styles: LIGHT_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: rtl ? google.maps.ControlPosition.LEFT_BOTTOM : google.maps.ControlPosition.RIGHT_BOTTOM },
          // Scroll the page past the map freely; ctrl/⌘ + wheel or two fingers
          // zoom it. A click (on a desktop) hands the wheel to the map.
          gestureHandling: 'cooperative',
          clickableIcons: false,
        });
        const circle = new Circle({
          map,
          center: { lat: latitude, lng: longitude },
          radius: APPROX_RADIUS_M,
          strokeColor: '#6B6B70',
          strokeOpacity: 0.55,
          strokeWeight: 1,
          fillColor: '#6B6B70',
          fillOpacity: 0.2,
          clickable: false,
        });
        // The true 80 m, but never under MIN_DIAMETER_PX on screen.
        const resize = () => {
          const z = map.getZoom() ?? START_ZOOM;
          const metresPerPx = (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** z;
          circle.setRadius(Math.max(APPROX_RADIUS_M, (MIN_DIAMETER_PX / 2) * metresPerPx));
        };
        map.addListener('zoom_changed', resize);
        resize();
        map.addListener('click', () => {
          if (window.matchMedia('(hover: hover)').matches) map.setOptions({ gestureHandling: 'greedy' });
        });
        mapRef.current = map;
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
    // The point and locale are fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setMapTypeId(satellite ? 'hybrid' : 'roadmap');
  }, [satellite, ready]);

  // ── Nearby markers: an HTML overlay per result, rendered by React (portal) ─
  useEffect(() => {
    const map = mapRef.current;
    for (const o of overlays.current) o.setMap(null);
    overlays.current = [];
    if (!map || !places.length) { setPinHosts([]); return; }

    class HtmlPin extends google.maps.OverlayView {
      constructor(private pos: google.maps.LatLngLiteral, public el: HTMLDivElement) { super(); }
      onAdd() { this.getPanes()?.overlayMouseTarget.appendChild(this.el); }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(this.pos);
        if (p) { this.el.style.left = `${p.x}px`; this.el.style.top = `${p.y}px`; }
      }
      onRemove() { this.el.remove(); }
    }

    const hosts = places.map((p) => {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.transform = 'translate(-50%, -50%)';
      const o = new HtmlPin({ lat: p.lat, lng: p.lng }, el);
      o.setMap(map);
      overlays.current.push(o);
      return { id: p.id, el };
    });
    setPinHosts(hosts);

    // Frame the area and the results together.
    const b = new google.maps.LatLngBounds(center);
    for (const p of places) b.extend({ lat: p.lat, lng: p.lng });
    map.fitBounds(b, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, ready]);

  const search = useCallback(async (cat: NearbyCategory) => {
    setCategory(cat);
    setSelected(null);
    const key = `${unitId}:${cat}`;
    const hit = cache.get(key);
    if (hit) { setPlaces(hit); setStatus('idle'); return; }
    setStatus('loading');
    try {
      await loadGoogleMaps(apiKey, locale);
      const { Place, SearchNearbyRankPreference } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
      const { places: found } = await Place.searchNearby({
        fields: ['id', 'displayName', 'primaryType', 'location', 'photos'],
        locationRestriction: { center: { lat: latitude, lng: longitude }, radius: SEARCH_RADIUS_M },
        includedPrimaryTypes: TYPES[cat],
        maxResultCount: 8,
        rankPreference: SearchNearbyRankPreference.DISTANCE,
        language: locale,
        region: 'tr',
      });
      const list: NearbyPlace[] = found.flatMap((p) => {
        const loc = p.location;
        if (!loc || !p.displayName) return [];
        const pos = { lat: loc.lat(), lng: loc.lng() };
        return [{
          id: p.id,
          name: p.displayName,
          lat: pos.lat,
          lng: pos.lng,
          metres: metresBetween({ lat: latitude, lng: longitude }, pos),
          photo: p.photos?.[0]?.getURI({ maxWidth: 160, maxHeight: 160 }) ?? null,
        }];
      });
      cache.set(key, list);
      setPlaces(list);
      setStatus('idle');
    } catch {
      setPlaces([]);
      setStatus('error');
    }
  }, [apiKey, latitude, longitude, locale, unitId]);

  function choose(p: NearbyPlace) {
    setSelected(p.id);
    mapRef.current?.panTo({ lat: p.lat, lng: p.lng });
  }

  const Icon = category ? CATEGORY_ICON[category] : null;
  const km = (m: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.max(0.1, Math.round(m / 100) / 10));
  const walk = (m: number) => Math.max(1, Math.round((m * 1.3) / 80));

  return (
    <div>
      {/* What's nearby — chips first, so the guest sees what can be asked. */}
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] rtl:tracking-normal rtl:font-sans text-mute">{t('title')}</p>
      <div className="-mx-4 px-4 mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NEARBY_CATEGORIES.map((c) => {
          const I = CATEGORY_ICON[c];
          const on = c === category;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => void search(c)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[999px] border px-4 text-sm transition-colors duration-[240ms] ${
                on ? 'border-ink bg-ink text-white' : 'border-rule bg-white text-ink-soft hover:border-ink-soft hover:text-ink'
              }`}
            >
              <I className="w-4 h-4" aria-hidden="true" />
              {t(`categories.${c}`)}
            </button>
          );
        })}
      </div>

      <div className="relative h-[300px] md:h-[420px] w-full overflow-hidden rounded-[14px] border border-rule bg-paper-warm">
        <div ref={box} className="absolute inset-0" />
        {failed && <p className="absolute inset-0 grid place-items-center text-sm text-mute">{t('error')}</p>}
        {ready && (
          <button
            type="button"
            onClick={() => setSatellite((s) => !s)}
            className="absolute top-3 start-3 z-10 rounded-full bg-white/95 px-3 py-2 text-xs font-medium text-ink shadow-sm ring-1 ring-rule transition-colors duration-[240ms] hover:bg-paper-warm"
          >
            {satellite ? tUnit('mapStreet') : tUnit('mapSatellite')}
          </button>
        )}
      </div>

      {/* Pins for the results, rendered into Google's overlay layer. */}
      {Icon && pinHosts.map(({ id, el }) => createPortal(
        <button
          type="button"
          aria-label={places.find((p) => p.id === id)?.name}
          onClick={() => setSelected(id)}
          className={`flex h-8 w-8 items-center justify-center rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.2)] ring-1 transition-transform duration-[240ms] ${
            selected === id ? 'scale-125 bg-ink text-white ring-ink' : 'bg-white text-ink ring-black/10'
          }`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </button>,
        el,
        id,
      ))}

      {category && (
        <div className="mt-3" aria-live="polite">
          {status === 'loading' && <p className="text-sm text-mute">{t('loading')}</p>}
          {status === 'error' && <p className="text-sm text-mute">{t('searchError')}</p>}
          {status === 'idle' && places.length === 0 && <p className="text-sm text-mute">{t('empty')}</p>}
          {status === 'idle' && places.length > 0 && (
            <ul className="divide-y divide-rule rounded-[14px] border border-rule bg-white">
              {places.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose(p)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors duration-[240ms] ${selected === p.id ? 'bg-paper-warm' : 'hover:bg-paper-warm'}`}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-paper-warm grid place-items-center text-mute">
                      {p.photo ? (
                        // A Google-hosted thumbnail: next/image would proxy (and re-bill) it.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt="" width={44} height={44} loading="lazy" className="h-full w-full object-cover" />
                      ) : Icon ? <Icon className="w-4 h-4" aria-hidden="true" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink"><bdi>{p.name}</bdi></span>
                      <span className="block text-xs text-mute">{t(`categories.${category}`)}</span>
                    </span>
                    <span className="shrink-0 text-end text-xs text-ink-soft tabular-nums">
                      <bdi>{t('km', { km: km(p.metres) })}</bdi>
                      <br />
                      <bdi>{t('walk', { minutes: walk(p.metres) })}</bdi>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
