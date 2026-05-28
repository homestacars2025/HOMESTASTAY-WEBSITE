'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { SaveButton } from '@/components/home/SaveButton';
import type { UnitMediaItem } from '@/lib/types/unit';

interface UnitGalleryProps {
  media: UnitMediaItem[];
  title: string;
  unitId: string;
}

export function UnitGallery({ media, title, unitId }: UnitGalleryProps) {
  // Cover first, then sort_order ascending — mirrors DB sort
  const sorted = [...media].sort((a, b) => {
    if (a.is_cover && !b.is_cover) return -1;
    if (!a.is_cover && b.is_cover) return 1;
    return a.sort_order - b.sort_order;
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Math.abs handles both LTR (positive) and RTL (negative in Chrome) scrollLeft
  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.offsetWidth === 0) return;
    const idx = Math.round(Math.abs(el.scrollLeft) / el.offsetWidth);
    setActiveIdx(Math.max(0, Math.min(idx, sorted.length - 1)));
  }, [sorted.length]);

  const cover = sorted[0];
  const thumbs = sorted.slice(1, 5);

  return (
    <div className="rounded-[14px] overflow-hidden">

      {/* ── Mobile: scroll-snap carousel ───────────────────────────────── */}
      <div className="relative md:hidden">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto scrollbar-none"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {sorted.map((item, i) => (
            <div
              key={item.id}
              className="flex-none w-full relative aspect-[4/3] bg-paper-warm"
              style={{ scrollSnapAlign: 'start' }}
            >
              <Image
                src={item.public_url}
                alt={`${title} — ${i + 1}`}
                fill
                sizes="100vw"
                className="object-cover"
                priority={i === 0}
              />
            </div>
          ))}
        </div>

        {/* Photo counter */}
        <div className="absolute top-3 end-3 bg-black/50 backdrop-blur-sm text-white font-mono text-[11px] px-2.5 py-1 rounded-full pointer-events-none select-none">
          {activeIdx + 1} / {sorted.length}
        </div>

        {/* Save button — SaveButton has its own absolute top-3 end-3 positioning */}
        <SaveButton unitId={unitId} />

        {/* Dot indicators */}
        {sorted.length > 1 && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
            {sorted.map((_, i) => (
              <span
                key={i}
                className={`block rounded-full transition-all duration-[240ms] ${
                  i === activeIdx
                    ? 'w-2 h-2 bg-white'
                    : 'w-1.5 h-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop: cover + 2×2 thumbnail grid ────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-[3fr_2fr] md:gap-1.5 h-[440px]">
        {/* Large cover — spans full height */}
        {cover && (
          <div className="relative h-full overflow-hidden bg-paper-warm">
            <Image
              src={cover.public_url}
              alt={title}
              fill
              sizes="(min-width: 1280px) 740px, 58vw"
              className="object-cover transition-transform duration-[240ms] hover:scale-[1.01]"
              priority
            />
            {/* Save button over cover */}
            <div className="absolute top-4 end-4">
              <SaveButton unitId={unitId} />
            </div>
          </div>
        )}

        {/* 2×2 thumbnails */}
        <div className="grid grid-cols-2 grid-rows-2 gap-1.5 h-full">
          {thumbs.map((item, i) => (
            <div key={item.id} className="relative h-full overflow-hidden bg-paper-warm">
              <Image
                src={item.public_url}
                alt={`${title} — ${i + 2}`}
                fill
                sizes="(min-width: 1280px) 270px, 21vw"
                className="object-cover transition-transform duration-[240ms] hover:scale-[1.02]"
              />
            </div>
          ))}
          {/* Fill empty slots if fewer than 4 thumbnails */}
          {Array.from({ length: Math.max(0, 4 - thumbs.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-paper-warm" />
          ))}
        </div>
      </div>
    </div>
  );
}
