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

/** Square canvas: the 120-unit mark plus 100 units of shadow margin each side. */
const MARK_VIEWBOX = 320;

/** Height of the arch itself, stroke included, in viewBox units. */
const ARCH_UNITS = 92;

/** Distance from the canvas edge to the arch: 100 of margin plus its 15 inset. */
const MARK_MARGIN_UNITS = 115;

/**
 * The <img> box that renders the arch at `archPx` tall.
 *
 * The arch is a minority of the canvas — the rest is deliberate empty margin —
 * so sizing the image by eye gets the mark's weight against the wordmark wrong.
 */
/**
 * The brand mark alone, in the accent, with its shadow baked in.
 *
 * WHY AN <img> AND NOT AN INLINE <svg> IN THE CARD
 *   Satori implements no `filter` property, so an inline svg cannot carry a
 *   drop shadow — and the card's logo now has nothing behind it but the
 *   photograph, which makes the shadow the only thing keeping it legible. An
 *   SVG data URI is rasterised by resvg, which does honour filters.
 *
 * The path is read from public/brand/mark.svg — the same canonical arch the
 * footer's BrandMark draws — rather than restated here, so the card cannot
 * drift from the site the way the old lockup's elongated arch did.
 *
 * The viewBox is grown by 100 units on every side. A filter cannot paint
 * outside its canvas, and the margin has to clear the WIDEST pass: at 40 units
 * against a stdDeviation of 22 (which carries ~3σ ≈ 66 units) the outer blur
 * was sliced off, printing a soft grey square around the arch on the card.
 */
export async function brandMarkAccent(): Promise<string> {
  const file = await readFile(path.join(process.cwd(), 'public/brand/mark.svg'), 'utf8');

  const pathMatch = file.match(/d="([^"]+)"/);
  if (!pathMatch) throw new Error('mark.svg: no path data');

  // ONE template literal, deliberately. This was assembled from adjacent
  // `...` + `...` fragments and the build dropped the closing quote of the
  // viewBox attribute — the emitted bundle read `320 320width="320"`, which
  // made resvg reject the document, and the mark rendered as an empty box on
  // the card while the layout still reserved its space.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 ${MARK_VIEWBOX} ${MARK_VIEWBOX}" width="${MARK_VIEWBOX}" height="${MARK_VIEWBOX}">${SHADOW_FILTER}<g filter="url(#glyph-shadow)"><rect x="-100" y="-100" width="${MARK_VIEWBOX}" height="${MARK_VIEWBOX}" fill="none"/><path d="${pathMatch[1]}" fill="none" stroke="#E52851" stroke-width="14" stroke-linecap="round"/></g></svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * The mark's shadow, matched to the text-shadow the wordmark carries beside it.
 *
 * Chained rather than parallel: each pass shadows the previous result, so the
 * darkness compounds close to the stroke, which is where legibility is decided.
 */
const SHADOW_FILTER =
  // A modest region — but see brandMarkAccent: it is measured against a group
  // whose bounding box is the WHOLE canvas, not the arch, so 120% of it is
  // ~30 units of fade room beyond a canvas that already carries 100.
  //
  // Two dead ends are recorded here so they are not retried: with the region
  // measured against the bare arch, 200% gave the chained blurs only ~45 units
  // and a hard grey square printed on the card; widening it to -110%/320% and,
  // separately, switching to filterUnits="userSpaceOnUse" both made resvg treat
  // the filter as invalid — and an element with an invalid filter is not
  // rendered at all, per spec, so the mark silently vanished from the card.
  '<filter id="glyph-shadow" x="-10%" y="-10%" width="120%" height="120%">' +
  // Densities chosen to match the wordmark's text-shadow stack beside it —
  // these are viewBox units (the canvas is 320 for a 92-unit arch), so they
  // read larger than the px radii in the CSS.
  '<feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#0E0E10" flood-opacity="1"/>' +
  '<feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#0E0E10" flood-opacity="1"/>' +
  '<feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#0E0E10" flood-opacity="0.95"/>' +
  '<feDropShadow dx="0" dy="6" stdDeviation="26" flood-color="#0E0E10" flood-opacity="0.8"/>' +
  '</filter>';

export function markBoxForArch(archPx: number): number {
  return Math.round((archPx * MARK_VIEWBOX) / ARCH_UNITS);
}

/**
 * The transparent margin around the arch inside that box, in px.
 *
 * The caller needs it to cancel the margin out with a negative CSS margin:
 * otherwise flex lays out the whole 195px canvas and the wordmark sits ~70px
 * further right than the design says, with the mark apparently adrift.
 */
export function markInset(boxPx: number): number {
  return Math.round((boxPx * MARK_MARGIN_UNITS) / MARK_VIEWBOX);
}

