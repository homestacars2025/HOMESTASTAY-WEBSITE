import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { allow, clientIp } from '@/lib/security/rate-limit';

/**
 * POST /api/events — search & click events from the browser (lib/analytics/events).
 *
 * Validates and trims every field, adds the device class from the User-Agent,
 * and hands the batch to public.log_search_events, which attaches the account
 * from the session (auth.uid()) and enforces its own per-session limit. The
 * IP is used for the in-memory burst limit only and is never stored.
 *
 * Always answers 204: a beacon has nobody to show an error to, and a guest's
 * page must never wait on analytics.
 */

const EVENTS = new Set(['search', 'results_shown', 'unit_click', 'unit_view', 'reserve_click', 'whatsapp_click', 'favorite']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SID = /^[A-Za-z0-9_-]{8,64}$/;
const LOCALES = new Set(['en', 'ar', 'tr', 'ru']);
const MAX_BODY = 32_000;

let missingLogged = false;

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}

function int(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
}

/** A flat object of short primitives (or short string lists) — nothing nested. */
function flat(v: unknown, maxKeys: number): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v).slice(0, maxKeys)) {
    if (!/^[a-z_]{1,32}$/i.test(k)) continue;
    if (typeof val === 'string') out[k] = val.slice(0, 100);
    else if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
    else if (typeof val === 'boolean' || val === null) out[k] = val;
    else if (Array.isArray(val)) out[k] = val.filter((x) => typeof x === 'string').slice(0, 20).map((x) => (x as string).slice(0, 40));
  }
  return Object.keys(out).length ? out : undefined;
}

function deviceOf(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

export async function POST(req: Request) {
  const done = new NextResponse(null, { status: 204 });
  if (!allow(`events:ip:${clientIp(req.headers)}`, 240, 60_000)) return done;

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return done;
    body = JSON.parse(text);
  } catch {
    return done;
  }

  const raw = (body as { events?: unknown })?.events;
  if (!Array.isArray(raw) || raw.length === 0) return done;
  const device = deviceOf(req.headers.get('user-agent') ?? '');

  const events = raw.slice(0, 25).flatMap((e) => {
    if (!e || typeof e !== 'object') return [];
    const r = e as Record<string, unknown>;
    if (typeof r.event !== 'string' || !EVENTS.has(r.event)) return [];
    if (typeof r.session_id !== 'string' || !SID.test(r.session_id)) return [];
    return [{
      session_id: r.session_id,
      event: r.event,
      source: str(r.source, 32),
      city: str(r.city, 80),
      area: str(r.area, 80),
      check_in: typeof r.check_in === 'string' && DATE.test(r.check_in) ? r.check_in : undefined,
      check_out: typeof r.check_out === 'string' && DATE.test(r.check_out) ? r.check_out : undefined,
      guests: int(r.guests, 0, 50),
      type: str(r.type, 20),
      filters: flat(r.filters, 16),
      unit_id: typeof r.unit_id === 'string' && UUID.test(r.unit_id) ? r.unit_id : undefined,
      unit_ids: Array.isArray(r.unit_ids) ? r.unit_ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 24) : undefined,
      position: int(r.position, 0, 10_000),
      locale: typeof r.locale === 'string' && LOCALES.has(r.locale) ? r.locale : undefined,
      device,
      utm: flat(r.utm, 8),
    }];
  });
  if (!events.length) return done;
  // One session per call — what the function expects.
  const session = events[0].session_id;
  const batch = events.filter((e) => e.session_id === session);

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('log_search_events', { p_events: batch });
    if (error) {
      // Until the DB team applies the migration the function does not exist:
      // say so once per instance, not once per event.
      if (error.code === 'PGRST202' || error.code === '42883') {
        if (!missingLogged) { missingLogged = true; console.warn('[events] log_search_events not deployed yet — events dropped'); }
      } else {
        console.error('[events]', { code: error.code, message: error.message });
      }
    }
  } catch (err) {
    console.error('[events]', { message: err instanceof Error ? err.message : String(err) });
  }
  return done;
}
