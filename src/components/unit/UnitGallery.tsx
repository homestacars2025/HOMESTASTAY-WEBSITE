'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Images } from 'lucide-react';
import { SaveButton } from '@/components/home/SaveButton';
import { ShareButton } from '@/components/unit/ShareButton';
import { SmartImage } from '@/components/media/SmartImage';
import { Lightbox } from '@/components/unit/Lightbox';
import type { UnitMediaItem } from '@/lib/types/unit';

interface UnitGalleryProps {
  media: UnitMediaItem[];
  title: string;
  unitId: string;
  /** Absolute canonical URL of this listing, for the share targets. */
  shareUrl: string;
  /** City · price · type — the same line the social card carries. */
  shareText: string;
}

export function UnitGallery({ media, title, unitId, shareUrl, shareText }: UnitGalleryProps) {
  const t = useTranslations('unit');

  // Cover first, then sort_order ascending — mirrors DB sort
  const sorted = [...media].sort((a, b) => {
    if (a.is_cover && !b.is_cover) return -1;
    if (!a.is_cover && b.is_cover) return 1;
    return a.sort_order - b.sort_order;
  });

  const [activeIdx, setActiveIdx] = useState(0);
  // null = closed; otherwise the index the lightbox opens at.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const openAt = useCallback((i: number) => setLightboxIndex(i), []);

  // Math.abs handles both LTR (positive) and RTL (negative in Chrome) scrollLeft
  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.offsetWidth === 0) return;
    const idx = Math.round(Math.abs(el.scrollLeft) / el.offsetWidth);
    setActiveIdx(Math.max(0, Math.min(idx, sorted.length - 1)));
  }, [sorted.length]);

  const cover = sorted[0];
  const thumbs = sorted.slice(1, 5);
  const remaining = sorted.length - 5; // extra photos beyond the 5 shown on desktop
  const hasPhotos = sorted.length > 0;

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
            <button
              key={item.id}
              type="button"
              onClick={() => openAt(i)}
              aria-label={t('gallery.openPhoto', { number: i + 1 })}
              className="flex-none w-full relative aspect-[4/3] bg-paper-warm block"
              style={{ scrollSnapAlign: 'start' }}
            >
              {/* Same idea as the Lightbox: the slides within two of the
                  active one are fetched now, so a swipe lands on a decoded
                  image instead of starting a download. Everything beyond that
                  stays lazy — a 30-photo listing must not pull 30 photos. */}
              <SmartImage
                src={item.public_url}
                alt={`${title} — ${i + 1}`}
                fill
                sizes="100vw"
                className="object-cover"
                {...(i === 0
                  ? { priority: true }
                  : {
                      loading: Math.abs(i - activeIdx) <= 2 ? ('eager' as const) : ('lazy' as const),
                      fetchPriority: i === activeIdx ? ('high' as const) : ('low' as const),
                    })}
              />
            </button>
          ))}
        </div>

        {/* Photo counter */}
        {hasPhotos && (
          // Start-anchored: the end corner now holds two buttons, and the
          // counter used to sit underneath the save heart.
          <div className="absolute top-3 start-3 bg-black/50 backdrop-blur-sm text-white font-mono text-[11px] px-2.5 py-1 rounded-full pointer-events-none select-none">
            {activeIdx + 1} / {sorted.length}
          </div>
        )}

        {/* Share + save, grouped so the two sit side by side over the photo.
            The counter above is start-anchored on mobile to stay clear of them. */}
        <div className="absolute top-3 end-3 flex items-center gap-2">
          <ShareButton url={shareUrl} title={title} text={shareText} />
          <SaveButton unitId={unitId} floating={false} />
        </div>

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
      <div className="relative hidden md:grid md:grid-cols-[3fr_2fr] md:gap-1.5 h-[440px]">
        {/* Large cover — spans full height */}
        {cover && (
          <div className="relative h-full overflow-hidden bg-paper-warm">
            <button
              type="button"
              onClick={() => openAt(0)}
              aria-label={t('gallery.openPhoto', { number: 1 })}
              className="group block w-full h-full"
            >
              <SmartImage
                src={cover.public_url}
                alt={title}
                fill
                sizes="(min-width: 1280px) 740px, 58vw"
                className="object-cover transition-transform duration-[240ms] group-hover:scale-[1.01]"
                priority
              />
            </button>
            {/* Share + save over the cover — siblings of the image button, not
                nested inside it (a button inside a button is invalid markup and
                swallows the inner click). */}
            <div className="absolute top-4 end-4 flex items-center gap-2">
              <ShareButton url={shareUrl} title={title} text={shareText} />
              <SaveButton unitId={unitId} floating={false} />
            </div>
          </div>
        )}

        {/* 2×2 thumbnails */}
        <div className="grid grid-cols-2 grid-rows-2 gap-1.5 h-full">
          {thumbs.map((item, i) => {
            const idx = i + 1; // index within `sorted`
            const isLastShown = i === thumbs.length - 1 && remaining > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openAt(idx)}
                aria-label={t('gallery.openPhoto', { number: idx + 1 })}
                className="group relative h-full overflow-hidden bg-paper-warm block"
              >
                {/* Above the fold on desktop, so eager — but explicitly low
                    priority so four thumbnails cannot delay the cover, which is
                    the LCP element. */}
                <SmartImage
                  src={item.public_url}
                  alt={`${title} — ${idx + 1}`}
                  fill
                  sizes="(min-width: 1280px) 270px, 21vw"
                  className="object-cover transition-transform duration-[240ms] group-hover:scale-[1.02]"
                  loading="eager"
                  fetchPriority="low"
                />
                {/* "+N" overlay on the last visible thumbnail when more exist */}
                {isLastShown && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-white text-lg font-medium tracking-[-0.01em]">
                    +{remaining}
                  </span>
                )}
              </button>
            );
          })}
          {/* Fill empty slots if fewer than 4 thumbnails */}
          {Array.from({ length: Math.max(0, 4 - thumbs.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-paper-warm" />
          ))}
        </div>

        {/* Show-all-photos affordance — opens the lightbox at the first image */}
        {hasPhotos && (
          <button
            type="button"
            onClick={() => openAt(0)}
            className="absolute bottom-4 end-4 inline-flex items-center gap-2 bg-white/95 text-ink rounded-[999px] px-4 py-2 text-sm font-medium shadow-[0_2px_12px_rgba(0,0,0,0.14)] hover:bg-white transition-colors duration-[240ms]"
          >
            <Images className="w-4 h-4" aria-hidden="true" />
            {t('gallery.showAllPhotos')}
          </button>
        )}
      </div>

      {/* ── Lightbox ────────────────────────────────────────────────────── */}
      {lightboxIndex !== null && (
        <Lightbox
          media={sorted}
          title={title}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
