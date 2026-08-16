import { routing, type Locale } from '@/i18n/routing';
import { CANONICAL_URL } from '@/lib/config/urls';

/**
 * Shared Open Graph / social-card plumbing.
 *
 * The canonical + hreflang half already lives in ./urls (canonical() and
 * hreflangAlternates()). This file holds the pieces those two cannot express:
 * the og:locale vocabulary, and turning a Supabase Storage image into a
 * correctly sized social card.
 */

export const SITE_NAME = 'Homesta Stay';

/**
 * og:locale wants language_TERRITORY, not the bare language code we route on.
 * ar_AR is the pan-Arabic form: the audience is Gulf + Libya + Turkey-resident
 * Arabic speakers, so pinning a single country (ar_SA, ar_EG) would be wrong
 * for most of them.
 */
const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  ar: 'ar_AR',
  tr: 'tr_TR',
  ru: 'ru_RU',
};

function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

export function ogLocale(locale: string): string {
  return isLocale(locale) ? OG_LOCALE[locale] : OG_LOCALE[routing.defaultLocale];
}

/**
 * The other three locales, for og:locale:alternate. Facebook and LinkedIn use
 * it to pick the right card when the same URL is shared into a differently
 * localised feed.
 */
export function ogAlternateLocales(locale: string): string[] {
  return routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]);
}

/** The 1.91:1 box every social platform crops to. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * The generated brand card, for pages with no photograph of their own.
 *
 * WHY REFERENCED EXPLICITLY RATHER THAN LEFT TO THE FILE CONVENTION
 *   app/opengraph-image.tsx is Next's file convention, and it is supposed to
 *   attach itself to every route beneath it. It does not here: this app has no
 *   app/layout.tsx (the <html> lives in app/[locale]/layout.tsx), so app/ is a
 *   segment with no layout and the image never propagates into [locale]/*.
 *   Verified — /en came back with no og:image at all. Naming the URL is
 *   deterministic, and it keeps ONE image instead of one per locale.
 *
 * Pages that DO have a real photograph (unit, destination) set openGraph.images
 * themselves and never call this.
 */
export function defaultOgImages() {
  return [
    {
      url: `${CANONICAL_URL}/opengraph-image`,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: `${SITE_NAME} — holiday rentals in Türkiye`,
      type: 'image/png',
    },
  ];
}

/**
 * A Supabase Storage image, resized for a social card.
 *
 * WHY NOT REUSE src/lib/image-loader.ts
 *   That loader passes resize=contain, which is right for a CSS-cropped card
 *   in the layout but wrong here: an OG image is consumed at a fixed 1200x630
 *   with no CSS to fix it up, so 'contain' yields a letterboxed photo floating
 *   in dead space. 'cover' fills the box, which is what a share card needs.
 *
 * Non-Supabase URLs pass through untouched, and anything falsy yields
 * undefined so the caller can omit `images` entirely rather than emit an empty
 * og:image (which some crawlers treat as a broken card).
 */
export function ogImage(src: string | null | undefined): string | undefined {
  if (!src) return undefined;

  if (!src.includes('supabase.co/storage/v1/object/public/')) return src;

  const url = new URL(
    src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/'),
  );
  url.searchParams.set('width', String(OG_IMAGE_WIDTH));
  url.searchParams.set('height', String(OG_IMAGE_HEIGHT));
  url.searchParams.set('resize', 'cover');
  url.searchParams.set('quality', '80');
  return url.toString();
}
