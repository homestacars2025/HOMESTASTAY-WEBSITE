import { NextResponse, after, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { cardUrls, slugForRow, warmCards } from '@/lib/seo/warm-cards';

/**
 * On-demand cache invalidation. Called by Supabase Database Webhooks when a
 * unit's data changes (units, unit_info, unit_daily_prices,
 * unit_pricing_overrides, unit_media) — see the webhook setup in the PR notes.
 *
 * It drops the single 'units' tag, which every cached public read carries
 * (listing, homepage pool, unit detail). Coarse on purpose: every price /
 * photo / status change also alters the shared listing card, so a per-unit tag
 * would be redundant — anything that touches one unit touches the 'units' set.
 *
 * It also RE-WARMS the changed unit's share card. Dropping the tag only makes
 * the old card unreachable; without this the next person to share that listing
 * would be the one who paid to rebuild it. Warming here means a brand new unit
 * is shareable the moment it is published, rather than at the next daily cron.
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
 * The unit a Supabase Database Webhook is telling us about.
 *
 * The payload is {type, table, record, old_record}. `record` is absent on a
 * DELETE, so old_record is the fallback — a deleted unit's card should stop
 * being served too, and re-warming it is how we find out it now 404s.
 *
 * A body we cannot parse is not an error: the tag has already been dropped by
 * then, which is the part that must not fail. We simply have no unit to warm.
 */
async function affectedSlug(request: NextRequest): Promise<string | null> {
  try {
    const body = await request.json();
    return await slugForRow(body?.record ?? body?.old_record ?? null);
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

  revalidateTag('units');

  const slug = await affectedSlug(request);

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
