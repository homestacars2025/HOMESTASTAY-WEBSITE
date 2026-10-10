'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A horizontal, swipeable row with previous/next buttons on desktop (a mouse
 * cannot swipe). Touch devices just scroll. Direction follows the document,
 * so in Arabic "next" moves toward the left.
 */
export function ScrollRow({
  className,
  prevLabel,
  nextLabel,
  children,
}: {
  className: string;
  prevLabel: string;
  nextLabel: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function page(step: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: step * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: 'smooth' });
  }

  const btn =
    'hidden md:flex absolute top-[38%] -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full border border-rule bg-white shadow-sm text-ink transition-opacity duration-[240ms] hover:opacity-80';

  return (
    <div className="relative">
      <div ref={ref} className={className}>{children}</div>
      <button type="button" aria-label={prevLabel} onClick={() => page(-1)} className={`${btn} -start-4`}>
        <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
      </button>
      <button type="button" aria-label={nextLabel} onClick={() => page(1)} className={`${btn} -end-4`}>
        <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
      </button>
    </div>
  );
}
