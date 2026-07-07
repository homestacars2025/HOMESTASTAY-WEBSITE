// Custom Next.js image loader that routes all optimization
// through Supabase Storage's render/image endpoint instead of Vercel's /_next/image.
// Bypasses Vercel's quota entirely (production was returning 402
// OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED); costs 0 on our plan.

type LoaderProps = {
  src: string;
  width: number;
  quality?: number;
};

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
  return url.toString();
}
