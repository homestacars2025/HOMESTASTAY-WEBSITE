import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Geist, read from the copy already vendored for the PDF renderer, so every
 * generated card shares the site's typeface.
 *
 * ⚠️ Any route that calls this needs an outputFileTracingIncludes entry in
 * next.config.ts: Vercel's tracer cannot see through a runtime path.join, so
 * without it the TTFs are absent from the deployed function and the route 500s.
 *
 * Coverage checked against the vendored file, not assumed: Latin and Cyrillic
 * are present (so Turkish and Russian titles render), Arabic is NOT — callers
 * rendering guest-supplied text must handle that themselves.
 */
export async function geistFont(weight: 'Regular' | 'Medium' | 'SemiBold'): Promise<ArrayBuffer> {
  const file = await readFile(
    path.join(process.cwd(), 'src/lib/pdf/fonts', `Geist-${weight}.ttf`),
  );
  return Uint8Array.from(file).buffer;
}

/**
 * The official brand lockup as a data URI, in the light-on-dark colourway.
 *
 * WHY THE REAL FILE AND NOT A HAND-DRAWN COPY
 *   The card used to redraw the mark as an SVG path and set the wordmark in
 *   Geist with an em dash — "homesta — stay" — which is not the lockup the site
 *   ships. public/brand/stay-lockup-compact.svg is all paths, no <text>, so
 *   satori rasterises the genuine artwork: same letterforms, same spacing, same
 *   relationship between "homesta" and "stay" as the site header.
 *
 * The only edit is the ink: the file paints "homesta" in --ink for a white
 * page, and the card sits on a photograph, so that one fill becomes white. The
 * accent stays exactly as the brand file specifies it.
 *
 * ⚠️ Needs an outputFileTracingIncludes entry, same as the fonts — nothing in
 * public/ is guaranteed to exist in a deployed function's filesystem.
 */
export async function brandLockupDark(): Promise<string> {
  const svg = await readFile(
    path.join(process.cwd(), 'public/brand/stay-lockup-compact.svg'),
    'utf8',
  );
  const light = svg.replaceAll('#0E0E10', '#FFFFFF');

  // The shadow is baked into the artwork rather than applied in the card's CSS
  // because satori implements no `filter` property — the only place a drop
  // shadow can exist here is inside the SVG the rasteriser handles itself.
  //
  // Two passes: a tight, near-opaque one that darkens the pixels immediately
  // around each glyph (this is what carries the contrast), and a wider, softer
  // one that lifts the whole lockup off a busy photograph. Both in --ink, so
  // the halo reads as the brand's own dark surface rather than as grey murk.
  const filter =
    '<filter id="lockup-shadow" x="-30%" y="-30%" width="160%" height="160%">' +
    // Chained, not parallel: each pass takes the previous result as its input,
    // so the tight opaque halo is itself shadowed by the wider ones and the
    // darkness compounds close to the glyph edge, which is where legibility is
    // decided. The "stay" accent is small and mid-tone — one soft pass left it
    // at 1.3:1 over a noon sky.
    '<feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#0E0E10" flood-opacity="1"/>' +
    '<feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#0E0E10" flood-opacity="1"/>' +
    '<feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#0E0E10" flood-opacity="1"/>' +
    '<feDropShadow dx="0" dy="0" stdDeviation="9" flood-color="#0E0E10" flood-opacity="0.95"/>' +
    '<feDropShadow dx="0" dy="2" stdDeviation="15" flood-color="#0E0E10" flood-opacity="0.85"/>' +
    '<feDropShadow dx="0" dy="4" stdDeviation="26" flood-color="#0E0E10" flood-opacity="0.6"/>' +
    '</filter>';

  const open = light.indexOf('>') + 1;
  const shadowed =
    light.slice(0, open) +
    filter +
    '<g filter="url(#lockup-shadow)">' +
    light.slice(open).replace('</svg>', '') +
    '</g></svg>';

  return `data:image/svg+xml;base64,${Buffer.from(shadowed).toString('base64')}`;
}

/** Intrinsic viewBox of the lockup — 793x250, ratio ≈ 3.172:1. */
export const LOCKUP_RATIO = 793 / 250;
