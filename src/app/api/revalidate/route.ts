import { NextResponse, after, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { cardUrls, slugForRow, warmCards } from '@/lib/seo/warm-cards';
import { routing } from '@/i18n/routing';

/**
 * On-demand cache invalidation. Called by Supabase Database Webhooks when a
 * unit's data changes (units, unit_info, unit_daily_prices,
 * unit_pricing_overrides, unit_media) — see the webhook setup in the PR notes —
 * and by HP-ADMIN when a city page is published or unpublished.
 *
 * WHICH TAG DEPENDS ON WHICH TABLE
 *   city_content → 'city-content'. The editorial copy and the city cover images
 *     are cached under that tag (see queries/destinations); it is a different
 *     set from inventory, and publishing a city page changes neither prices nor
 *     photos. Dropping 'units' for it would evict the whole catalogue to
 *     refresh a paragraph.
 *   anything else → 'units', which every cached public read of inventory
 *     carries (listing, homepage pool, unit detail). Coarse on purpose: every
 *     price / photo / status change also alters the shared listing card, so a
 *     per-unit tag would be redundant — anything that touches one unit touches
 *     the 'units' set.
 *
 * It also RE-WARMS the changed unit's share card. Dropping the tag only makes
 * the old card unreachable; without this the next person to share that listing
 * would be the one who paid to rebuild it. Warming here means a brand new unit
 * is shareable the moment it is published, rather than at the next daily cron.
 *
 * EXPLICIT UNIT CALLS — {"type":"unit","slug":"…"} (optionally "old_slug")
 *   For the database to call directly whenever a unit is created, published,
 *   edited or archived, independent of webhook payload shapes. Drops 'units',
 *   revalidates the unit's page in every locale plus the listing and home
 *   pages, and re-warms its share cards. "old_slug" covers a renamed unit, so
 *   the old address stops serving the old page too.
 *
 * SECURITY: this is a cache-control lever, and an open one is a DoS vector
 * (an attacker could force endless revalidation). It requires a shared secret
 * and rejects everything else LOUDLY. If REVALIDATE_SECRET is unset the route
 * is closed, never open.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(request: NextRequest): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;
  const provided =
    request.headers.get('x-revalidate-secret') ??
    new URL(request.url).searchParams.get('secret') ??
    '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The webhook payload: {type, table, record, old_record}.
 *
 * Read ONCE, before anything else needs it — a request body is a stream, and
 * the table name and the affected row are now both read from it. A body we
 * cannot parse is not an error: it simply means no table to route on and no
 * unit to warm, and the tag drop below still happens.
 */
async function payload(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A nested object off the payload — `record` / `old_record` — or null. */
function row(body: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = body?.[key];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * The unit a Supabase Database Webhook is telling us about.
 *
 * `record` is absent on a DELETE, so old_record is the fallback — a deleted
 * unit's card should stop being served too, and re-warming it is how we find
 * out it now 404s.
 */
/** Slugs are generated (lowercase, digits, hyphens); a UUID also resolves. */
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

function slugField(body: Record<string, unknown> | null, key: string): string | null {
  const value = body?.[key];
  return typeof value === 'string' && SLUG_RE.test(value.trim()) ? value.trim() : null;
}

/** Every locale's copy of the pages a unit change can alter. */
function unitPaths(slugs: string[]): string[] {
  const paths: string[] = [];
  for (const locale of routing.locales) {
    for (const slug of slugs) paths.push(`/${locale}/stays/${slug}`);
    paths.push(`/${locale}/stays`, `/${locale}`);
  }
  return paths;
}

async function affectedSlug(body: Record<string, unknown> | null): Promise<string | null> {
  try {
    return await slugForRow(row(body, 'record') ?? row(body, 'old_record'));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    console.error('[revalidate] REJECTED unauthorized call', {
      from: request.headers.get('x-forwarded-for') ?? 'unknown',
      hasSecretConfigured: Boolean(process.env.REVALIDATE_SECRET),
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await payload(request);

  // A city page went live, came down, or had its copy edited in HP-ADMIN.
  // Nothing about inventory changed, and there is no share card to warm:
  // dropping the editorial tag is the whole job.
  if (body?.table === 'city_content') {
    revalidateTag('city-content');
    console.log('[revalidate] dropped city-content', {
      slug: row(body, 'record')?.slug ?? null,
    });
    return NextResponse.json({ revalidated: true, tag: 'city-content' });
  }

  // An explicit unit call from the database: {type:'unit', slug}. Checked
  // before the webhook path because a webhook's `type` is INSERT/UPDATE/DELETE,
  // never 'unit', so the two cannot be confused.
  if (body?.type === 'unit') {
    const unitSlug = slugField(body, 'slug');
    if (!unitSlug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 });
    }
    const oldSlug = slugField(body, 'old_slug');
    const slugs = oldSlug && oldSlug !== unitSlug ? [unitSlug, oldSlug] : [unitSlug];

    // The tag is what actually refreshes the data — unit detail, listing,
    // homepage pool and services are all cached under 'units'. The paths drop
    // any rendered copy of those pages on top of it.
    revalidateTag('units');
    const paths = unitPaths(slugs);
    for (const path of paths) revalidatePath(path);

    after(async () => {
      const result = await warmCards(cardUrls(unitSlug), {
        deadlineMs: 45_000,
        bust: String(Date.now()),
      });
      console.log('[revalidate] unit call re-warmed card', { slug: unitSlug, ...result });
    });

    console.log('[revalidate] unit', { slug: unitSlug, oldSlug, paths: paths.length });
    return NextResponse.json({ revalidated: true, tag: 'units', slugs, paths });
  }

  revalidateTag('units');

  const slug = await affectedSlug(body);

  if (slug) {
    // after(), not await: Supabase gives a webhook a few seconds before it
    // times out and retries, and warming four locales can outlast that. The
    // response goes back immediately and the warming runs on after the
    // function has replied.
    after(async () => {
      // bust: true. This card ALREADY EXISTS in the CDN, so a plain request
      // would be answered by the stale copy and never reach the renderer. The
      // busted URL forces a real render into the Data Cache; the CDN's own
      // entry then heals within s-maxage, because stale-while-revalidate
      // refreshes it behind a request that is already being served instantly.
      const result = await warmCards(cardUrls(slug), {
        deadlineMs: 45_000,
        bust: String(Date.now()),
      });
      console.log('[revalidate] re-warmed card', { slug, ...result });
    });
  }

  return NextResponse.json({ revalidated: true, tag: 'units', warming: slug });
}
