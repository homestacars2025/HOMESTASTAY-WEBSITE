import { createPublicClient } from '@/lib/supabase/public';
import { routing } from '@/i18n/routing';
import { CANONICAL_URL } from '@/lib/config/urls';
import { storeCard } from './card-upload';

/**
 * Pre-generating unit share cards, so no guest ever waits for one.
 *
 * Shared by the two callers that warm them: the daily cron (/api/og/warm) and
 * the Supabase edit webhook (/api/revalidate), which warms the single unit that
 * changed the moment it changes.
 *
 * WHY WARMING IS FETCHING OUR OWN PUBLIC URL
 *   The request travels the same path a crawler's will, so it populates both
 *   layers at once: the Data Cache entry inside the function, and the CDN's
 *   copy of the response. Calling the renderer directly would fill only the
 *   first, and the crawler would still take a CDN miss.
 */

/**
 * Measured, not guessed. At 8 the first full sweep covered ~half the catalogue
 * before the deadline and the rest stayed cold — a sampled check found 5 of 10
 * untouched units still taking a CDN miss. 200 units x 4 locales is ~800
 * fetches; at the ~2s a cold card costs that needs 16 in flight to finish
 * inside the budget, and every sweep after the first is far cheaper because it
 * is answering from the card's own cache.
 */
const CONCURRENCY = 16;

/** One card is a photo fetch plus a composite; 30s is generous even when cold. */
const REQUEST_TIMEOUT_MS = 30_000;

export type WarmResult = { warmed: number; attempted: number; total: number };

/**
 * The card URLs for one unit, in every locale.
 *
 * All four are fetched even though ar and en share a Data Cache entry — the
 * card is keyed by what it DRAWS and Arabic falls back to the Latin caption, so
 * the second of the pair is a cheap cache hit. It still has to happen: what is
 * being warmed there is the CDN entry for the ?locale=ar URL, and that one is
 * per-URL, not per-render.
 */
export type CardTarget = { slug: string; locale: string; url: string };

export function cardUrls(slug: string): CardTarget[] {
  return routing.locales.map((locale) => ({
    slug,
    locale,
    url: `${CANONICAL_URL}/opengraph-image/stays/${encodeURIComponent(slug)}?locale=${locale}`,
  }));
}

/** Every published unit's slug. Empty on failure — the caller reports it. */
export async function publishedSlugs(): Promise<string[] | null> {
  // The same view the sitemap reads: it already applies the public-visibility
  // filter, so an unpublished or hidden unit is never warmed.
  const { data, error } = await createPublicClient().from('v_sitemap_units').select('slug');

  if (error) {
    console.error('[og:warm] v_sitemap_units failed', { message: error.message, code: error.code });
    return null;
  }
  return (data ?? []).map((row) => String(row.slug ?? '').trim()).filter(Boolean);
}

/**
 * The slug behind a webhook payload's row.
 *
 * The webhook fires for units and for its satellites (unit_info, unit_media,
 * unit_daily_prices, unit_pricing_overrides). Only the first carries a slug;
 * the rest carry unit_id, so those need the lookup.
 */
export async function slugForRow(row: Record<string, unknown> | null): Promise<string | null> {
  if (!row) return null;

  const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
  if (slug) return slug;

  const unitId = typeof row.unit_id === 'string' ? row.unit_id.trim() : '';
  if (!unitId) return null;

  const { data, error } = await createPublicClient()
    .from('units')
    .select('slug')
    .eq('id', unitId)
    .maybeSingle();

  if (error) {
    console.error('[og:warm] slug lookup failed', { unitId, message: error.message });
    return null;
  }
  const resolved = typeof data?.slug === 'string' ? data.slug.trim() : '';
  return resolved || null;
}

/**
 * Fetch one card so it lands in the caches.
 *
 * `bust` decides WHICH cache is being filled, and the two callers want
 * different things:
 *
 *   bust=false (a card that has never been generated — the cron's job). The
 *   plain URL is requested, so the CDN stores the response under the very key a
 *   crawler will ask for. This is the only mode that can turn a first share
 *   into a cache HIT.
 *
 *   bust=true (a card that already exists and has just CHANGED — the edit
 *   webhook's job). A plain request here would be answered by the CDN's own
 *   stale copy and never reach the renderer, so nothing would be refreshed. A
 *   unique query string guarantees the function runs and re-fills the Data
 *   Cache. The CDN's copy of the real URL then heals itself within s-maxage:
 *   stale-while-revalidate serves it instantly and refreshes behind the
 *   request, and that refresh is a Data Cache hit — already the new card.
 *
 * A failure is reported and swallowed: one bad unit must not end a sweep.
 */
async function warmOne(target: CardTarget, bust: string | null): Promise<boolean> {
  const url = bust ? `${target.url}&_w=${bust}` : target.url;
  try {
    const res = await fetch(url, {
      // Not to be answered by a cached copy of this fetch inside the warming
      // function itself — unrelated to the CDN entry being filled.
      cache: 'no-store',
      headers: { 'user-agent': 'homesta-og-warmer' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error('[og:warm] non-ok', { url, status: res.status });
      return false;
    }

    // The bytes are already in hand, so this is the cheap moment to make them
    // permanent — see card-store for why the caches alone were not enough. A
    // failed upload still counts as a warm: the CDN and Data Cache entries were
    // filled by the request above, which is what the old design relied on.
    const bytes = new Uint8Array(await res.arrayBuffer());
    await storeCard(
      target.slug,
      target.locale,
      bytes,
      res.headers.get('content-type') ?? 'image/jpeg',
    );
    return true;
  } catch (error) {
    console.error('[og:warm] failed', { url, error });
    return false;
  }
}

/**
 * Warm every URL, `CONCURRENCY` at a time, and stop STARTING work at
 * `deadlineMs`.
 *
 * The deadline exists so a growing inventory surfaces as a number rather than a
 * platform timeout: a killed function logs nothing useful, and the sweep would
 * silently stop warming the tail of the list with nobody the wiser until a
 * guest shared one of those listings and waited.
 */
export async function warmCards(
  targets: CardTarget[],
  { deadlineMs, bust = null }: { deadlineMs: number; bust?: string | null },
): Promise<WarmResult> {
  const until = Date.now() + deadlineMs;
  let next = 0;
  let warmed = 0;
  let attempted = 0;

  const worker = async () => {
    while (next < targets.length && Date.now() < until) {
      const target = targets[next++];
      attempted++;
      if (await warmOne(target, bust)) warmed++;
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return { warmed, attempted, total: targets.length };
}
