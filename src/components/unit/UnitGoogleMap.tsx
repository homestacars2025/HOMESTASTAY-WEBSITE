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
import { BrandMark } from '@/components/brand/BrandMark';

/**
 * The unit page map (Google Maps JS) and "What's nearby".
 *
 * PRIVACY: the point arrives already blurred on the server (20–50 m off, 4
 * decimals). The map draws the 80 m circle around it and the Homesta badge
 * CENTRED on it (48–56 px, anchored at its middle, not a pin tip — it marks an
 * area, never a door). Max zoom 16. Other businesses (hotels included) are
 * hidden from the base map, so no competitor shows on our listing.
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

/**
 * Clean, light base map. poi.business is OFF — hotels and every shop,
 * restaurant and brand — so a competitor never appears on our listing.
 * Transit, parks, places of worship, landmarks, hospitals and street names
 * stay. (A styles array, not a cloud Map ID: no Map ID is configured, and a
 * Map ID would ignore this array.)
 */
const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ saturation: -35 }, { lightness: 8 }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -60 }, { lightness: 20 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ saturation: -20 }, { lightness: 15 }] },
];

/** An HTML element on the map, centred on a point (React renders into `el`). */
type HtmlOverlay = google.maps.OverlayView & { el: HTMLDivElement };
let HtmlOverlayClass: (new (pos: google.maps.LatLngLiteral, z: number) => HtmlOverlay) | null = null;
function htmlOverlay(pos: google.maps.LatLngLiteral, z = 1): HtmlOverlay {
  if (!HtmlOverlayClass) {
    HtmlOverlayClass = class extends google.maps.OverlayView {
      el: HTMLDivElement;
      constructor(private pos: google.maps.LatLngLiteral, z: number) {
        super();
        this.el = document.createElement('div');
        this.el.style.position = 'absolute';
        this.el.style.transform = 'translate(-50%, -50%)'; // centred, not a pin tip
        this.el.style.zIndex = String(z);
      }
      onAdd() { this.getPanes()?.overlayMouseTarget.appendChild(this.el); }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(this.pos);
        if (p) { this.el.style.left = `${p.x}px`; this.el.style.top = `${p.y}px`; }
      }
      onRemove() { this.el.remove(); }
    };
  }
  return new HtmlOverlayClass(pos, z);
}

/** Keys whose 3D icon file is missing — asked once per page, then the line icon. */
const missingIcons = new Set<NearbyCategory>();

/**
 * The 3D icon for a category — Microsoft Fluent Emoji 3D (MIT; see
 * public/icons/nearby/README.md). 48 px file for small sizes (sharp at 2×),
 * 96 px above that. Falls back to the line icon if a file is ever missing.
 */
function NearbyIcon({ cat, size }: { cat: NearbyCategory; size: number }) {
  const [missing, setMissing] = useState(missingIcons.has(cat));
  const Line = CATEGORY_ICON[cat];
  if (missing) return <Line style={{ width: size * 0.75, height: size * 0.75 }} aria-hidden="true" />;
  return (
    // A tiny local asset at a fixed size; next/image adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={size > 24 ? `/icons/nearby/${cat}.webp` : `/icons/nearby/${cat}-48.webp`}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="object-contain"
      onError={() => { missingIcons.add(cat); setMissing(true); }}
    />
  );
}

/**
 * A result thumbnail that is only requested when its row is actually on
 * screen — each one is a billed Place Photo request.
 */
function LazyThumb({ src, cat }: { src: string | null; cat: NearbyCategory }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !src || show) return;
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) { setShow(true); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [src, show]);
  return (
    <span ref={ref} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-paper-warm grid place-items-center text-mute">
      {src && show ? (
        // A Google-hosted thumbnail: next/image would proxy (and re-bill) it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={44} height={44} className="h-full w-full object-cover" />
      ) : (
        <NearbyIcon cat={cat} size={24} />
      )}
    </span>
  );
}

/** Thumbnails per chip: the nearest few get one, the rest show the icon. */
const MAX_PHOTOS = 6;

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
  /**
   * Every category loaded so far on this page. Their lists stay MOUNTED (the
   * inactive ones hidden): a thumbnail is a billed Place Photo request, and
   * re-mounting the <img> on a second tap would fetch — and bill — it again.
   */
  const [loaded, setLoaded] = useState<Partial<Record<NearbyCategory, NearbyPlace[]>>>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [selected, setSelected] = useState<string | null>(null);
  const [pinHosts, setPinHosts] = useState<{ id: string; el: HTMLDivElement }[]>([]);
  const [stayHost, setStayHost] = useState<HTMLDivElement | null>(null);
  const [stayLabel, setStayLabel] = useState(false);
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
          strokeColor: '#E52851',
          strokeOpacity: 0.4,
          strokeWeight: 1.5,
          fillColor: '#E52851',
          fillOpacity: 0.12,
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
        // Our badge, centred on the blurred point, above the circle.
        const stay = htmlOverlay({ lat: latitude, lng: longitude }, 2);
        stay.setMap(map);
        setStayHost(stay.el);
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

    const hosts = places.map((p) => {
      const o = htmlOverlay({ lat: p.lat, lng: p.lng }, 1);
      o.setMap(map);
      overlays.current.push(o);
      return { id: p.id, el: o.el };
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
    if (hit) { setPlaces(hit); setLoaded((l) => ({ ...l, [cat]: hit })); setStatus('idle'); return; }
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
      const list: NearbyPlace[] = found.flatMap((p, i) => {
        const loc = p.location;
        if (!loc || !p.displayName) return [];
        const pos = { lat: loc.lat(), lng: loc.lng() };
        return [{
          id: p.id,
          name: p.displayName,
          lat: pos.lat,
          lng: pos.lng,
          metres: metresBetween({ lat: latitude, lng: longitude }, pos),
          // Smallest useful size, nearest MAX_PHOTOS only. getURI builds a URL;
          // the billed request happens when LazyThumb actually shows it.
          photo: i < MAX_PHOTOS ? p.photos?.[0]?.getURI({ maxWidth: 96, maxHeight: 96 }) ?? null : null,
        }];
      });
      cache.set(key, list);
      setPlaces(list);
      setLoaded((l) => ({ ...l, [cat]: list }));
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

  const km = (m: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.max(0.1, Math.round(m / 100) / 10));
  const walk = (m: number) => Math.max(1, Math.round((m * 1.3) / 80));

  return (
    <div>
      {/* What's nearby — chips first, so the guest sees what can be asked. */}
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] rtl:tracking-normal rtl:font-sans text-mute">{t('title')}</p>
      <div className="-mx-4 px-4 mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NEARBY_CATEGORIES.map((c) => {
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
              <NearbyIcon cat={c} size={20} />
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
      {category && pinHosts.map(({ id, el }) => createPortal(
        <button
          type="button"
          aria-label={places.find((p) => p.id === id)?.name}
          onClick={() => setSelected(id)}
          className={`flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-transform duration-[240ms] ${
            selected === id ? 'scale-125 ring-2 ring-ink' : 'ring-1 ring-black/10'
          }`}
        >
          <NearbyIcon cat={category} size={24} />
        </button>,
        el,
        id,
      ))}

      {/* Our stay: the Homesta badge, centred on the blurred point. */}
      {stayHost && createPortal(
        <div className="relative">
          <button
            type="button"
            aria-label={t('stayArea')}
            // Tap toggles; hover only for a real mouse (a tap also emits mouse
            // events, which would open and immediately close it).
            onClick={() => setStayLabel((v) => !v)}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') setStayLabel(true); }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setStayLabel(false); }}
            className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full border-[3px] border-white bg-stay text-white shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
          >
            <BrandMark className="h-6 w-6 md:h-7 md:w-7" />
          </button>
          {stayLabel && (
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full start-1/2 mb-2 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white shadow-sm"
            >
              {t('stayArea')}
            </span>
          )}
        </div>,
        stayHost,
      )}

      {category && (
        <div className="mt-3" aria-live="polite">
          {status === 'loading' && <p className="text-sm text-mute">{t('loading')}</p>}
          {status === 'error' && <p className="text-sm text-mute">{t('searchError')}</p>}
          {status === 'idle' && places.length === 0 && <p className="text-sm text-mute">{t('empty')}</p>}
          {(Object.keys(loaded) as NearbyCategory[]).map((cat) => {
            const list = loaded[cat] ?? [];
            const shown = status === 'idle' && cat === category && list.length > 0;
            return (
              <ul key={cat} hidden={!shown} className="divide-y divide-rule rounded-[14px] border border-rule bg-white">
                {list.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choose(p)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors duration-[240ms] ${selected === p.id ? 'bg-paper-warm' : 'hover:bg-paper-warm'}`}
                    >
                      <LazyThumb src={p.photo} cat={cat} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink"><bdi>{p.name}</bdi></span>
                        <span className="block text-xs text-mute">{t(`categories.${cat}`)}</span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
