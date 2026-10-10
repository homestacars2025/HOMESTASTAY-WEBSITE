/**
 * Search & click events → /api/events → public.log_search_events (see
 * supabase/pending/20261010_search_v2_favorites_events.sql).
 *
 * What ranking will one day learn from: what was searched, what was shown,
 * what was opened, saved and reserved. Browser-only; a silent no-op on the
 * server and wherever storage or beacons are blocked — analytics never breaks
 * a page.
 *
 * NO PII, by construction: the shape below has no field for a name, email,
 * phone or free text. Cities and areas are the RESOLVED canonical names the
 * search ran with, never what a guest typed. The account (if any) is attached
 * on the server from the session, never sent from here.
 */

export type SearchEventName =
  | 'search' | 'results_shown' | 'unit_click' | 'unit_view'
  | 'reserve_click' | 'whatsapp_click' | 'favorite';

export interface SearchEvent {
  event: SearchEventName;
  /** Where a unit_click came from: results | home | city | similar | map. */
  source?: string;
  city?: string;
  area?: string;
  check_in?: string;
  check_out?: string;
  guests?: number;
  type?: string;
  filters?: Record<string, string | number | boolean | string[] | null>;
  unit_id?: string;
  unit_ids?: string[];
  position?: number;
}

const SID_KEY = 'hs_sid';
const UTM_KEY = 'hs_utm';
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];

const queue: Record<string, unknown>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let bound = false;

function store(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

/** One id per browser tab session. Random, carries nothing about the person. */
function sessionId(): string {
  const s = store();
  let id = s?.getItem(SID_KEY) ?? '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
    s?.setItem(SID_KEY, id);
  }
  return id;
}

/**
 * The campaign the session arrived from: UTM tags (and ad click ids) from the
 * LANDING url, plus the referring site's host — read once per session, so a
 * later internal page does not overwrite where the guest came from.
 */
export function captureLanding(): void {
  const s = store();
  if (!s || s.getItem(UTM_KEY) !== null) return;
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const k of UTM_PARAMS) {
    const v = params.get(k);
    if (v) utm[k] = v.slice(0, 100);
  }
  try {
    const ref = document.referrer ? new URL(document.referrer).host : '';
    if (ref && ref !== window.location.host) utm.referrer = ref.slice(0, 100);
  } catch { /* unparsable referrer */ }
  s.setItem(UTM_KEY, JSON.stringify(utm));
}

function landing(): Record<string, string> | undefined {
  try {
    const v = JSON.parse(store()?.getItem(UTM_KEY) ?? 'null');
    return v && Object.keys(v).length ? v : undefined;
  } catch { return undefined; }
}

function flush(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const batch = queue.splice(0, 25);
  const body = JSON.stringify({ events: batch });
  try {
    // A beacon survives the navigation a click starts; fetch keepalive is the fallback.
    const sent = navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }));
    if (!sent) void fetch('/api/events', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
  } catch { /* never throw into a page */ }
  if (queue.length) flush();
}

export function track(e: SearchEvent, { now = false }: { now?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  try {
    captureLanding();
    queue.push({
      ...e,
      session_id: sessionId(),
      locale: document.documentElement.lang || undefined,
      utm: landing(),
    });
    if (!bound) {
      bound = true;
      // The page may go away at any moment: send what is queued when it does.
      addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
    if (now || queue.length >= 20) flush();
    else if (!timer) timer = setTimeout(flush, 1000);
  } catch { /* never throw into a page */ }
}
