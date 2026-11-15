import { NextResponse } from 'next/server';
import { allow, clientIp } from '@/lib/security/rate-limit';
import { isNearbyCategory } from '@/lib/maps/nearby';
import {
  placesConfigured, searchNearbyForUnit, searchTextNearUnit, unitPublicPoint, type NearbyLang,
} from '@/lib/maps/nearby-server';

/**
 * GET|POST /api/app/nearby — "What's nearby" for the mobile app, which must
 * never carry a Google key. Spec: the app session's website-route-spec.md.
 *
 *   category mode  ?unit=<uuid>&category=<cat>&lang=<en|ar|tr|ru>
 *                  Places Nearby Search, 1 km, 8 nearest — the website chips' search.
 *   text mode      ?unit=<uuid>&query=<text>&lang=…
 *                  Places Text Search, biased 2 km around the same point.
 *
 * POST takes the same keys as a JSON body. `unit_id` is accepted for `unit`.
 *
 *   200  {"places":[{"id","name","type","lat","lng"}]} — no photos, no
 *        distances (the app computes them from the same public point).
 *   400  {"error":"unit required"} when unit, or both category and query, are
 *        missing. The app probes with no parameters and reads 400 as "the
 *        route exists" — keep this exact.
 *   404  unit not live / unknown, OR the server key is not configured: the
 *        probe then sees 404 and the app keeps the section hidden instead of
 *        showing chips that can only fail.
 *   429  more than 60 requests a minute from one IP (per instance).
 *
 * The point is always the unit's public, blurred one, read on the server
 * (lib/maps/nearby-server). Coordinates from the caller are never accepted.
 * No CORS: the caller is a native app.
 */

const LANGS = new Set<NearbyLang>(['en', 'ar', 'tr', 'ru']);
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const QUERY_MAX = 80;

const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(status: number, error: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...headers } });
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

async function handle(req: Request, params: Record<string, unknown>, cdnCacheable: boolean) {
  if (!placesConfigured()) return fail(404, 'not available');

  if (!allow(`app-nearby:${clientIp(req.headers)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return fail(429, 'rate limited', { 'Retry-After': '60' });
  }

  const unit = str(params.unit) || str(params.unit_id);
  const category = str(params.category);
  // Whitespace collapsed, so "  cafe   near " and "cafe near" share a cache entry.
  const query = str(params.query).replace(/\s+/g, ' ');
  const langIn = str(params.lang).toLowerCase() as NearbyLang;
  const lang: NearbyLang = LANGS.has(langIn) ? langIn : 'en';

  if (!unit || (!category && !query)) return fail(400, 'unit required');
  if (category && !isNearbyCategory(category)) return fail(400, 'unknown category');
  if (!category && query.length > QUERY_MAX) return fail(400, 'query too long');

  try {
    const point = await unitPublicPoint(unit);
    if (!point) return fail(404, 'unit not found');

    const places = isNearbyCategory(category)
      ? await searchNearbyForUnit(unit, point, category, lang)
      : await searchTextNearUnit(unit, point, query, lang);

    return NextResponse.json(
      { places },
      { headers: { 'Cache-Control': cdnCacheable ? 'public, s-maxage=86400' : 'private, max-age=3600' } },
    );
  } catch (e) {
    console.error('[app/nearby] failed', { mode: category ? 'category' : 'text', message: (e as Error).message });
    return fail(502, 'places unavailable');
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return handle(req, Object.fromEntries(sp.entries()), true);
}

export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const params = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  return handle(req, params, false);
}
