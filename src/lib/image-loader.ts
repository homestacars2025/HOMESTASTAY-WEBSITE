// Custom Next.js image loader that routes all optimization
// through Supabase Storage's render/image endpoint instead of Vercel's /_next/image.
// Bypasses Vercel's quota entirely (production was returning 402
// OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED); costs 0 on our plan.

type LoaderProps = {
  src: string;
  width: number;
  quality?: number;
};

/**
 * The CDN edge to serve images from, if one is configured.
 *
 * WHY THIS EXISTS
 *   The Supabase project lives in Korea. A 84 KB thumbnail measured 2.7s to a
 *   visitor in Türkiye — nearly all of it round-trip latency, not bytes. A CDN
 *   in front of Storage answers from a nearby edge instead.
 *
 * ONLY THE HOSTNAME CHANGES. The path — /storage/v1/render/image/public/… and
 * every width/quality/resize parameter — is passed through untouched, because
 * the CDN is a pull zone whose origin IS Supabase Storage: it forwards the same
 * path and caches the same transform. Nothing about how images are addressed,
 * fetched or transformed moves.
 *
 * REVERTING IS UNSETTING THE VARIABLE. With NEXT_PUBLIC_IMAGE_HOST absent every
 * URL is left on the Supabase origin, which is exactly the behaviour before
 * this was added. Note it is read at build time (NEXT_PUBLIC_* is inlined), so
 * a change takes effect on the next deploy, not on a running one.
 */
const IMAGE_HOST = normalizeHost(process.env.NEXT_PUBLIC_IMAGE_HOST);

/** The Storage origin the CDN pulls from, for mapping back the other way. */
const STORAGE_ORIGIN = normalizeHost(process.env.NEXT_PUBLIC_SUPABASE_URL);

function normalizeHost(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  // Accepts "https://img.example.com" or a bare "img.example.com".
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * The origin of `url` if it is a Supabase Storage URL, otherwise null.
 *
 * Parsed rather than string-matched so that an external image (Unsplash, a
 * local /_next asset, anything a future surface points at) can never be
 * rewritten onto our CDN by accident.
 */
function storageOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith('/storage/v1/')) return null;
    if (!parsed.hostname.endsWith('.supabase.co')) return null;
    return parsed.origin;
  } catch {
    // Relative paths (/brand/mark.svg) are not absolute URLs and not ours.
    return null;
  }
}

/**
 * Swap a Supabase Storage URL onto the configured CDN host.
 *
 * A no-op when no CDN is configured, and for any URL that is not Supabase
 * Storage. Exported because og:image URLs are built in lib/config/seo.ts and
 * must land on the same host as everything else.
 */
export function withImageHost(url: string): string {
  if (!IMAGE_HOST) return url;
  const origin = storageOrigin(url);
  if (!origin || origin === IMAGE_HOST) return url;
  return IMAGE_HOST + url.slice(origin.length);
}

/**
 * The inverse: a CDN URL mapped back to the Storage origin.
 *
 * Used as a retry path by the share-card renderer — a CDN that is
 * misconfigured or still warming should cost a slower card, never a card with
 * no photograph on it.
 */
export function withStorageHost(url: string): string {
  if (!IMAGE_HOST || !STORAGE_ORIGIN) return url;
  if (!url.startsWith(IMAGE_HOST)) return url;
  return STORAGE_ORIGIN + url.slice(IMAGE_HOST.length);
}

export default function supabaseImageLoader({ src, width, quality }: LoaderProps): string {
  // Only rewrite Supabase Storage public-object URLs. Everything else passes
  // through unchanged (local /_next/static assets, external CDNs, etc).
  if (!src.includes('supabase.co/storage/v1/object/public/')) {
    return src;
  }

  // Rewrite: /object/public/ → /render/image/public/
  // This unlocks the width/quality/format query params served by Supabase Storage.
  const rewritten = src.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );

  const url = new URL(rewritten);
  url.searchParams.set('width', String(width));
  url.searchParams.set('quality', String(quality ?? 75));
  // Without this, Supabase crops a full-height strip to the target width
  // (verified: a 1600x1200 source came back 640x1200, not 640x480). 'contain'
  // scales proportionally so the whole image survives; the CSS object-fit on
  // the card/gallery layouts handles the final display crop at the right zoom.
  url.searchParams.set('resize', 'contain');
  // No format param — Supabase auto-negotiates WebP for supporting browsers.

  // Host swap LAST, so the path and every parameter above are already final.
  return withImageHost(url.toString());
}
