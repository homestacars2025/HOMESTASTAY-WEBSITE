import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createPublicClient } from '@/lib/supabase/public';
import { routing } from '@/i18n/routing';
import { CANONICAL_URL } from '@/lib/config/urls';

/**
 * Pre-generates every unit's share card, so no guest ever pays for one.
 *
 * WHY IT EXISTS
 *   /opengraph-image/stays/[slug] caches its composited bytes (see renderCard
 *   there), which makes every share after the first instant. This route is what
 *   removes the "after the first": it walks the published units and fetches
 *   each card once, on a schedule, so the entry is already warm when a guest
 *   pastes the link into WhatsApp and the crawler comes knocking.
 *
 *   It matters more than it looks. A link preview is fetched ONCE per platform
 *   and then cached on their side for days — so the single slow request is the
 *   one that decides whether the card appears at all. WhatsApp and Facebook
 *   both give up on a slow og:image and show a bare link.
 *
 * WHY FETCHING OUR OWN URL RATHER THAN CALLING THE RENDERER
 *   The request travels the same path a crawler's will, so it warms both layers
 *   at once: the Data Cache entry inside the function, and the CDN's copy of
 *   the response. Calling renderCard directly would warm only the first.
 *
 * ar SHARES en's ENTRY. renderCard is keyed by what the card DRAWS, and Arabic
 * falls back to the Latin caption, so /ar and /en resolve to one cached render.
 * The fetch still runs — it is the CDN entry for the ?locale=ar URL that is
 * being warmed there, and that one is per-URL.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * ~110 published units x 4 locales is ~440 fetches. At the ~0.5s a cold card
 * costs, eight at a time clears that in well under a minute; the first sweep
 * after a deploy is the only expensive one, because every sweep after it is
 * answering from the card's own cache.
 */
const CONCURRENCY = 8;

/**
 * Stop STARTING work here, short of maxDuration, and report the shortfall.
 *
 * The alternative is a platform timeout, which kills the function mid-flight
 * and logs nothing useful — the sweep would silently stop warming the tail of
 * the list as the inventory grew, and nobody would know until a guest shared
 * one of those listings and waited. A truthful `remaining` in the response is
 * the signal to split the sweep.
 */
const DEADLINE_MS = 240_000;

/**
 * Vercel's scheduler sends `Authorization: Bearer $CRON_SECRET`. The
 * x-revalidate-secret header is the manual door, sharing the secret
 * /api/revalidate already uses so warming can be triggered by hand after a
 * bulk import without provisioning a second credential.
 *
 * With NEITHER secret configured the route is closed, never open: it makes the
 * deployment fetch a few hundred of its own URLs, which is a fine amplifier for
 * someone else to hold.
 */
function authorised(request: NextRequest): boolean {
  const bearer = request.headers.get('authorization') ?? '';
  const header = request.headers.get('x-revalidate-secret') ?? '';

  return (
    matches(bearer, `Bearer ${process.env.CRON_SECRET ?? ''}`, process.env.CRON_SECRET) ||
    matches(header, process.env.REVALIDATE_SECRET ?? '', process.env.REVALIDATE_SECRET)
  );
}

function matches(provided: string, expected: string, configured: string | undefined): boolean {
  if (!configured) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Warm one card. A failure is reported, never thrown: one bad unit must not end the sweep. */
async function warm(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      // The point is to reach the renderer, not to be answered by a cached copy
      // of this fetch inside the warming function itself.
      cache: 'no-store',
      headers: { 'user-agent': 'homesta-og-warmer' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error('[og:warm] non-ok', { url, status: res.status });
      return false;
    }
    // Drain it — an unread body holds the connection open.
    await res.arrayBuffer();
    return true;
  } catch (error) {
    console.error('[og:warm] failed', { url, error });
    return false;
  }
}

async function sweep(urls: string[]): Promise<{ warmed: number; attempted: number }> {
  const until = Date.now() + DEADLINE_MS;
  let next = 0;
  let warmed = 0;
  let attempted = 0;

  const worker = async () => {
    while (next < urls.length && Date.now() < until) {
      const url = urls[next++];
      attempted++;
      if (await warm(url)) warmed++;
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return { warmed, attempted };
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    console.error('[og:warm] REJECTED unauthorized call', {
      from: request.headers.get('x-forwarded-for') ?? 'unknown',
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // The same view the sitemap reads: it already applies the public-visibility
  // filter, so an unpublished or hidden unit is never warmed.
  const { data, error } = await createPublicClient()
    .from('v_sitemap_units')
    .select('slug');

  if (error) {
    console.error('[og:warm] v_sitemap_units failed', { message: error.message, code: error.code });
    return NextResponse.json({ error: 'units unavailable' }, { status: 502 });
  }

  const urls = (data ?? [])
    .map((row) => String(row.slug ?? '').trim())
    .filter(Boolean)
    .flatMap((slug) =>
      routing.locales.map(
        (locale) =>
          `${CANONICAL_URL}/opengraph-image/stays/${encodeURIComponent(slug)}?locale=${locale}`,
      ),
    );

  const { warmed, attempted } = await sweep(urls);
  const remaining = urls.length - attempted;
  if (remaining > 0) {
    console.error('[og:warm] hit the deadline with cards left', { remaining, total: urls.length });
  }
  console.log('[og:warm] done', { warmed, attempted, remaining, total: urls.length });

  return NextResponse.json({ warmed, attempted, remaining, total: urls.length });
}
