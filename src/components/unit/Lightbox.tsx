'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { SmartImage } from '@/components/media/SmartImage';
import { modalBackdrop } from '@/lib/motion';
import type { UnitMediaItem } from '@/lib/types/unit';

interface LightboxProps {
  /** Already sorted the way the grid shows them (cover first, then sort_order). */
  media:      UnitMediaItem[];
  title:      string;
  startIndex: number;
  onClose:    () => void;
}

/**
 * Full-screen photo viewer for the unit gallery. Opens at startIndex, wraps
 * around with arrows / ← → keys / swipe, closes on the ✕, Esc, or a backdrop
 * tap. Rendered via a portal to escape the page's stacking/overflow, and only
 * mounted while open (so document.body always exists — no SSR render).
 */
export function Lightbox({ media, title, startIndex, onClose }: LightboxProps) {
  const t = useTranslations('unit');
  const [index, setIndex] = useState(startIndex);
  const touchX = useRef<number | null>(null);

  const count = media.length;

  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count],
  );

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard: Esc closes, arrows navigate. Physical left/right = prev/next.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const current = media[index];
  if (!current) return null;

  const content = (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-[500] flex flex-col bg-ink/95 backdrop-blur-sm"
        variants={modalBackdrop}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onClose}
      >
        {/* Top bar: counter + close */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <span className="font-mono text-[12px] tracking-[0.06em] text-white/80 tabular-nums select-none">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label={t('gallery.close')}
            className="w-11 h-11 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors duration-[240ms]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image stage — tapping the empty area or swiping navigates/closes */}
        <div
          className="relative flex-1 min-h-0"
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            // Swipe left → next, swipe right → prev (physical, direction-neutral).
            if (Math.abs(dx) > 40 && count > 1) go(dx < 0 ? 1 : -1);
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center p-4 md:p-12">
            {/* Stop close on the image itself; the padded area around it closes. */}
            <div className="relative w-full h-full" onClick={(e) => e.stopPropagation()}>
              <SmartImage
                key={current.id}
                src={current.public_url}
                alt={`${title} — ${index + 1}`}
                fill
                sizes="100vw"
                className="object-contain select-none"
                priority
              />
            </div>
          </div>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                aria-label={t('gallery.previous')}
                className="absolute top-1/2 -translate-y-1/2 start-2 md:start-4 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors duration-[240ms]"
              >
                <ChevronLeft className="w-6 h-6 rtl:rotate-180" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                aria-label={t('gallery.next')}
                className="absolute top-1/2 -translate-y-1/2 end-2 md:end-4 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors duration-[240ms]"
              >
                <ChevronRight className="w-6 h-6 rtl:rotate-180" />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
