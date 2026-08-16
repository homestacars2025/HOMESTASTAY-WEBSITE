import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '@/lib/config/seo';

/**
 * The default social card, for pages that have no photograph of their own.
 *
 * WHY IT IS GENERATED RATHER THAN A FILE IN public/
 *   The repo has no raster brand asset — public/brand holds SVGs only, and
 *   every social platform ignores an SVG og:image. Rather than ask for a PNG
 *   that would then need re-exporting whenever the brand moves, this renders
 *   the mark and wordmark from the same primitives the site uses (the arch path
 *   is character-for-character the one in components/brand/BrandMark).
 *
 * WHY A ROUTE HANDLER AND NOT THE opengraph-image.tsx FILE CONVENTION
 *   It WAS the file convention, and that was wrong twice over. The convention
 *   attaches an image to the routes beneath its segment — but this app has no
 *   app/layout.tsx (the <html> lives in app/[locale]/layout.tsx), so app/ is a
 *   segment with no layout, the image never reached [locale]/* (verified: /en
 *   came back with no og:image at all), AND every build printed
 *   "metadataBase property in metadata export is not set … using
 *   http://localhost:3000" because Next tried to resolve the convention image
 *   against a metadataBase that does not exist at that segment. Confirmed by
 *   bisection: the warning is absent at HEAD, appears with the file, and
 *   disappears when it is removed.
 *
 *   As a route handler it leaves the metadata pipeline entirely — no
 *   resolution, no warning — and the pages name the URL explicitly through
 *   defaultOgImages(), which is what already made them work.
 *
 * THE PATH IS LOAD-BEARING: /opengraph-image is one of the four dotless paths
 * the middleware matcher excludes by name (see src/middleware.ts). Renaming it
 * to anything else would send it through next-intl and 307-redirect the image
 * to /en/<name>.
 *
 * One image serves all four locales: the card carries no page-specific text, so
 * there is no Arabic or Cyrillic shaping to get wrong and one asset to cache.
 *
 * Dark ground on purpose. Law 4: "The black presence is intentional — it gives
 * a premium, modern feel and sets us apart from Airbnb's palette", and the
 * brand file's dark-mode rule is that the accent carries the mark.
 */

export const runtime = 'nodejs';
/** Static: the card has no request-dependent content. */
export const dynamic = 'force-static';

const size = { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT };

// Brand tokens, inlined — Tailwind's CSS custom properties do not exist inside
// satori, which resolves no stylesheet.
const INK = '#0E0E10';
const STAY = '#E52851';
const PAPER = '#FFFFFF';
const MUTE = '#8C8881';
const HAIRLINE = '#25252A';

/**
 * Geist, read from the copy already vendored for the PDF renderer, so the card
 * and the site share one typeface. See the outputFileTracingIncludes entry in
 * next.config.ts — Vercel's tracer cannot see a runtime path.join, so this file
 * is named there explicitly or the deployed function renders without it.
 */
async function geist(weight: 'Regular' | 'Medium'): Promise<ArrayBuffer> {
  const file = await readFile(
    path.join(process.cwd(), 'src/lib/pdf/fonts', `Geist-${weight}.ttf`),
  );
  return Uint8Array.from(file).buffer;
}

export async function GET() {
  const [regular, medium] = await Promise.all([geist('Regular'), geist('Medium')]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: INK,
          padding: '72px 80px',
          fontFamily: 'Geist',
        }}
      >
        {/* Mark — the same arch as components/brand/BrandMark, in the accent. */}
        <svg width="96" height="96" viewBox="0 0 120 120" fill="none">
          <path
            d="M22 100 L 22 60 A 38 38 0 0 1 98 60 L 98 100"
            stroke={STAY}
            strokeWidth="14"
            strokeLinecap="round"
          />
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Wordmark — always lowercase, weight 500, tracking -0.045em. */}
          <div
            style={{
              display: 'flex',
              fontSize: 84,
              fontWeight: 500,
              letterSpacing: '-0.045em',
              color: PAPER,
              lineHeight: 1,
            }}
          >
            homesta
            <span style={{ color: MUTE, padding: '0 18px' }}>—</span>
            <span style={{ color: STAY }}>stay</span>
          </div>

          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              color: MUTE,
              letterSpacing: '-0.01em',
            }}
          >
            Holiday rentals in Türkiye — villas, apartments &amp; cabins
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${HAIRLINE}`,
            paddingTop: 28,
            fontSize: 22,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: MUTE,
          }}
        >
          <span>homestastay.com</span>
          {/* Language codes, not endonyms: Geist has no Arabic or Cyrillic
              coverage, and satori renders an uncovered glyph as tofu rather
              than falling back. */}
          <span>AR · EN · TR · RU</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: regular, weight: 400, style: 'normal' },
        { name: 'Geist', data: medium, weight: 500, style: 'normal' },
      ],
    },
  );
}
