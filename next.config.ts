import type { NextConfig } from 'next';
import path from 'path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Resolve the workspace-root warning from the parent-dir package-lock.json
  outputFileTracingRoot: path.join(__dirname),
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
