import type { NextConfig } from 'next';
import path from 'path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Resolve the workspace-root warning from the parent-dir package-lock.json
  outputFileTracingRoot: path.join(__dirname),
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Supabase Storage — geo-media bucket (city images)
      { protocol: 'https', hostname: 'djtpksherrayzxmunvkv.supabase.co' },
    ],
  },
};

export default withNextIntl(nextConfig);
