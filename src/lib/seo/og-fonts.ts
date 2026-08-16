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
