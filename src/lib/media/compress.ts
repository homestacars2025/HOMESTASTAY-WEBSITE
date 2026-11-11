/**
 * Browser-only photo shrinking before upload.
 *
 * Phones hand over 5–25 MB photos, which stall an upload on 4G and are far
 * larger than anything a chat thumbnail needs. The same rule as listing photos
 * in the host portal (HS-HOST lib/image/compress): re-encode as WebP, at most
 * 2400 px wide and 24 MP, quality 0.85 — with the Canvas API, no library.
 *
 * Also reports the image's width and height, stored with the attachment so a
 * thumbnail can reserve its space before it loads (no layout shift).
 *
 * Never rejects. A browser that cannot decode the file, or cannot encode WebP,
 * gets the original back: a failed optimisation must never cost the guest
 * their upload.
 */

const MAX_WIDTH = 2400;
const MAX_PIXELS = 24_000_000;
const QUALITY = 0.85;
/** Below this, re-encoding costs more (a full decode) than it saves. */
const MIN_BYTES = 300_000;
const MIN_WEBP_BYTES = 500_000;
/** Formats a canvas round-trips safely. HEIC is not decodable outside Safari. */
const DECODABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type PreparedImage = { file: File; width?: number; height?: number };

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!DECODABLE.has(file.type)) return { file };
  let img: HTMLImageElement;
  try {
    img = await load(file);
  } catch {
    return { file };
  }
  const original = { file, width: img.naturalWidth || undefined, height: img.naturalHeight || undefined };

  const big = file.type === 'image/webp' ? file.size >= MIN_WEBP_BYTES : file.size >= MIN_BYTES;
  if (!big) return original;

  try {
    const scaleW = img.naturalWidth > MAX_WIDTH ? MAX_WIDTH / img.naturalWidth : 1;
    let width = Math.round(img.naturalWidth * scaleW);
    let height = Math.round(img.naturalHeight * scaleW);
    if (width * height > MAX_PIXELS) {
      const s = Math.sqrt(MAX_PIXELS / (width * height));
      width = Math.round(width * s);
      height = Math.round(height * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
    // Re-encoding can inflate an already-tight file; keep it only when it wins.
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return original;
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.webp`;
    return { file: new File([blob], name, { type: 'image/webp' }), width, height };
  } catch {
    return original;
  }
}

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}
