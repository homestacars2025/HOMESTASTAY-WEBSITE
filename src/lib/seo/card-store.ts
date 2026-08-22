import { createHash } from 'node:crypto';
import { withImageHost } from '@/lib/image-loader';

/**
 * Permanent storage for generated share cards.
 *
 * WHY THIS EXISTS — the caches underneath were never meant to hold images.
 *   The card route caches its composited bytes in the Next Data Cache, and that
 *   worked beautifully right up until it didn't. Vercel's own documentation is
 *   explicit on both counts: the Data Cache is "Ephemeral … when a cache
 *   reaches this limit, Vercel evicts the entries that haven't been accessed
 *   recently", it is shared by every project in the team on Hobby and Pro, and
 *   "Complete HTTP responses (images, fonts, etc.)" are listed as what it is
 *   NOT a good fit for.
 *
 *   ~200 units x 4 locales x ~150 KB of base64 is ~120 MB of JPEG pushed
 *   through a shared, LRU-evicted cache. Measured: cards warmed to a 14/14
 *   edge-HIT one evening were 7/8 cold the next morning, at 1.3–1.8s each,
 *   both cache layers gone.
 *
 *   An object in Storage is not evicted. It is written once, served from the
 *   same CDN host as every other image on the site, and it is still there
 *   tomorrow.
 *
 * WHAT THIS DOES NOT CHANGE
 *   The route stays the fallback and the generator. og:image only points here
 *   once the object is known to exist (see storedCardIfPresent) — a share card
 *   that 404s is worse than a slow one, and that is the failure this design
 *   refuses to risk.
 *
 * READ SIDE ONLY. Writing lives in ./card-upload, which imports the
 * service-role client. That module must not be reachable from anything a page
 * imports: supabase/admin throws on sight of `window`, so pulling it in here
 * would make this file unsafe to touch from a component tree.
 */

export const BUCKET = 'og-cards';

/** Stable path, overwritten in place. The version rides in the query string. */
export function cardObjectPath(slug: string, locale: string): string {
  return `stays/${slug}/${locale}.jpg`;
}

/**
 * A short digest of what the card DRAWS, for cache-busting the public URL.
 *
 * The object path is stable and upserted, so this does not have to be perfect —
 * it only has to CHANGE when the picture does. Price, title and cover are the
 * three that move; a unit type relabelled in isolation would not bust the URL
 * until the next sweep overwrites the object anyway.
 */
export function cardVersion(parts: {
  price: string | null;
  title: string | null;
  cover: string | null;
}): string {
  return createHash('sha1')
    .update([parts.price ?? '', parts.title ?? '', parts.cover ?? ''].join('|'))
    .digest('hex')
    .slice(0, 10);
}

/** The public URL of a stored card, through the same CDN host as the photos. */
export function storedCardUrl(slug: string, locale: string, version: string): string {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const object = `${origin}/storage/v1/object/public/${BUCKET}/${cardObjectPath(slug, locale)}`;
  return `${withImageHost(object)}?v=${version}`;
}

/**
 * The stored card's URL, but only when the object is actually there.
 *
 * A HEAD, because being wrong here costs a listing its share card entirely.
 * Anything other than a clean 200 — a missing object, a cold bucket, a CDN
 * hiccup, a thrown fetch — returns null and the caller keeps pointing og:image
 * at the route, which always renders something.
 */
export async function storedCardIfPresent(
  slug: string,
  locale: string,
  version: string,
): Promise<string | null> {
  const url = storedCardUrl(slug, locale, version);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}
