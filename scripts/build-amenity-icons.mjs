/**
 * Builds the filter-panel amenity icons from the app's 3D renders.
 *
 *   node scripts/build-amenity-icons.mjs [sourceDir]
 *
 * Source: HOMESTA-APP/assets/icons/am-*-3d.png — the same files the app ships,
 * 120–300 KB each at ~512px. The filter chip draws them at 32px, so each is
 * trimmed to its silhouette and written as a 96px WebP (3x density) — a few KB
 * instead of ~1.3 MB for the set (Law 1).
 *
 * am-washer-3d.png carries a documented ground-shadow tail: a grey smear that
 * runs past the machine's right edge along its bottom rows. It is erased here
 * (every opaque pixel right of the body's edge, below the body) before the
 * trim, so the trimmed box hugs the machine instead of the shadow.
 */
import sharp from 'sharp';
import path from 'node:path';

const SRC = process.argv[2] ?? path.resolve('../HOMESTA-APP/assets/icons');
const OUT = path.resolve('public/icons/amenities');
const SIZE = 96;

// DB column → source file stem. Output files are named by column so the code
// maps one-to-one with unit_amenities.
const ICONS = {
  parking: 'am-parking-3d',
  pool: 'am-pool-3d',
  elevator: 'am-elevator-3d',
  self_check_in: 'am-selfcheckin-3d',
  washing_machine: 'am-washer-3d',
  gym: 'am-gym-3d',
  extra_bed: 'am-extra-bed-3d',
};

/** Erase the washer's shadow tail. Mutates the raw RGBA buffer. */
function eraseWasherTail(data, width, height) {
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] > 128;
  // The body's right edge, measured on the rows well above the floor shadow.
  let edge = 0;
  const bodyTop = Math.round(height * 0.2);
  const bodyBottom = Math.round(height * 0.85);
  for (let y = bodyTop; y < bodyBottom; y++) {
    for (let x = width - 1; x > edge; x--) {
      if (opaque(x, y)) { edge = x; break; }
    }
  }
  // Below the body, nothing may extend past that edge.
  for (let y = bodyBottom; y < height; y++) {
    for (let x = edge + 2; x < width; x++) data[(y * width + x) * 4 + 3] = 0;
  }
  return edge;
}

for (const [column, stem] of Object.entries(ICONS)) {
  const input = path.join(SRC, `${stem}.png`);
  let img = sharp(input).ensureAlpha();

  if (column === 'washing_machine') {
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const edge = eraseWasherTail(data, info.width, info.height);
    console.log(`  washer tail erased right of x=${edge}`);
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }

  const trimmed = await img.trim({ threshold: 10 }).png().toBuffer();
  const out = path.join(OUT, `${column}.webp`);
  const { size } = await sharp(trimmed)
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(out);
  console.log(`${column.padEnd(16)} ${(size / 1024).toFixed(1)} KB`);
}
