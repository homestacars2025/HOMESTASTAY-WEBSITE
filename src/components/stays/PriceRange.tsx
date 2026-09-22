'use client';

import { PRICE_MAX, PRICE_MIN, PRICE_STEP } from '@/lib/stays/filters';

/**
 * Dual-thumb nightly price slider — two native range inputs over one track.
 *
 * Native inputs give keyboard, screen-reader and touch behaviour for free, and
 * they mirror on their own in an RTL document: in Arabic the minimum sits on
 * the right. The coloured fill between the thumbs is positioned with
 * inset-inline-start, so it mirrors with them.
 *
 * The thumbs cannot cross: each stops one step short of the other.
 */
export function PriceRange({
  min,
  max,
  onChange,
  minLabel,
  maxLabel,
  format,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
  minLabel: string;
  maxLabel: string;
  format: (value: number, isTop: boolean) => string;
}) {
  const span = PRICE_MAX - PRICE_MIN;
  const startPct = ((min - PRICE_MIN) / span) * 100;
  const endPct = ((max - PRICE_MIN) / span) * 100;

  return (
    <div className="relative h-11" dir="inherit">
      {/* Track */}
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-rule" />
      {/* Selected span */}
      <div
        className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink"
        style={{ insetInlineStart: `${startPct}%`, width: `${endPct - startPct}%` }}
      />
      <input
        type="range"
        className="price-range"
        min={PRICE_MIN}
        max={PRICE_MAX}
        step={PRICE_STEP}
        value={min}
        aria-label={minLabel}
        aria-valuetext={format(min, false)}
        onChange={(e) => onChange(Math.min(Number(e.target.value), max - PRICE_STEP), max)}
      />
      <input
        type="range"
        className="price-range"
        min={PRICE_MIN}
        max={PRICE_MAX}
        step={PRICE_STEP}
        value={max}
        aria-label={maxLabel}
        aria-valuetext={format(max, max >= PRICE_MAX)}
        onChange={(e) => onChange(min, Math.max(Number(e.target.value), min + PRICE_STEP))}
      />
    </div>
  );
}
