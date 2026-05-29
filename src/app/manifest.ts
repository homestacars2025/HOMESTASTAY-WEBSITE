import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Homesta Stay',
    short_name: 'Homesta',
    description: 'Short-term and touristic rentals in Istanbul',
    start_url: '/en',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#0E0E10',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
