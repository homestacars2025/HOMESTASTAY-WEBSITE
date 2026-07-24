import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

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

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    console.error('[revalidate] REJECTED unauthorized call', {
      from: request.headers.get('x-forwarded-for') ?? 'unknown',
      hasSecretConfigured: Boolean(process.env.REVALIDATE_SECRET),
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  revalidateTag('units');
  return NextResponse.json({ revalidated: true, tag: 'units' });
}
