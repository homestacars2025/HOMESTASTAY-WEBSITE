import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { cardUrls, publishedSlugs, warmCards } from '@/lib/seo/warm-cards';

/**
 * Pre-generates unit share cards, so no guest ever pays for one.
 *
 * WHY IT EXISTS
 *   /opengraph-image/stays/[slug] caches its composited bytes, which makes
 *   every share after the first instant. This route is what removes the "after
 *   the first": it walks the published units and fetches each card once, so the
 *   entry is already warm — in the CDN and in the Data Cache — when a guest
 *   pastes the link into WhatsApp and the crawler comes knocking.
 *
 *   It matters more than it looks. A link preview is fetched ONCE per platform
 *   and then cached on their side for days, so the single slow request is the
 *   one that decides whether the card appears at all. WhatsApp and Facebook
 *   both give up on a slow og:image and show a bare link.
 *
 * TWO CALLERS, TWO SHAPES
 *   - No query: the whole published catalogue. This is the daily cron in
 *     vercel.json, and the safety net that catches anything the webhook missed.
 *   - ?slug=a,b,c: just those units. /api/revalidate uses it to warm a single
 *     listing the instant Supabase reports it changed, which is what makes a
 *     BRAND NEW unit shareable immediately rather than at the next cron.
 *
 * ONE CAVEAT, STATED PLAINLY: Vercel's CDN caches per edge location. Warming
 * runs in this project's single function region (fra1), so it fills the POPs
 * near it. A crawler on another continent still takes a CDN miss — but that
 * miss now costs a Data Cache read (~250ms), not a composite. There is no
 * public per-URL purge or global fill API to do better from here.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Short of maxDuration, so the sweep reports its shortfall instead of being killed. */
const DEADLINE_MS = 240_000;

/**
 * Vercel's scheduler sends `Authorization: Bearer $CRON_SECRET`. The
 * x-revalidate-secret header is the manual door, sharing the secret
 * /api/revalidate already uses so a sweep can be triggered by hand after a bulk
 * import without provisioning a second credential.
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

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    console.error('[og:warm] REJECTED unauthorized call', {
      from: request.headers.get('x-forwarded-for') ?? 'unknown',
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get('slug');
  const slugs = requested
    ? requested.split(',').map((s) => s.trim()).filter(Boolean)
    : await publishedSlugs();

  if (!slugs) {
    return NextResponse.json({ error: 'units unavailable' }, { status: 502 });
  }

  const urls = slugs.flatMap(cardUrls);
  const result = await warmCards(urls, { deadlineMs: DEADLINE_MS });
  const remaining = result.total - result.attempted;

  if (remaining > 0) {
    console.error('[og:warm] hit the deadline with cards left', {
      remaining,
      total: result.total,
    });
  }
  console.log('[og:warm] done', { units: slugs.length, ...result, remaining });

  return NextResponse.json({ units: slugs.length, ...result, remaining });
}
