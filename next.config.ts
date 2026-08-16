import type { NextConfig } from 'next';
import path from 'path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Resolve the workspace-root warning from the parent-dir package-lock.json
  outputFileTracingRoot: path.join(__dirname),
  // The confirmation email renders the legal PDFs with embedded Geist. Vercel's
  // tracer cannot see fonts loaded by a runtime path.join, so name them
  // explicitly or they are absent in the deployed function and the render fails.
  outputFileTracingIncludes: {
    '/api/payment/callback': ['./src/lib/pdf/fonts/*.ttf'],
    // Same reason, same fonts: the default social card renders the wordmark in
    // Geist via ImageResponse, reading the TTFs with a runtime path.join that
    // the tracer cannot follow. Without this the deployed route throws and every
    // og:image on the brand pages 500s.
    '/opengraph-image/route': ['./src/lib/pdf/fonts/*.ttf'],
  },
  images: {
    // Route optimization through Supabase Storage's render/image endpoint
    // (see src/lib/image-loader.ts). Vercel's own /_next/image optimizer is
    // bypassed entirely — it was returning 402 (Hobby-plan quota exhausted).
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    // With a custom loader Next no longer uses its built-in optimizer, so
    // remotePatterns is not strictly enforced; kept as documentation of the
    // hosts we serve images from.
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Supabase Storage — unit-media + geo-media buckets
      { protocol: 'https', hostname: 'djtpksherrayzxmunvkv.supabase.co', pathname: '/storage/v1/**' },
    ],
  },
};

export default withNextIntl(nextConfig);
