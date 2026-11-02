import Image from 'next/image';
import { cn } from '@/lib/utils';

interface WordmarkProps {
  className?: string;
  /** 'light' for dark surfaces (the footer): the wordmark in white, the arch unchanged. */
  variant?: 'dark' | 'light';
}

// The brand lockup: the arch + the "homesta" wordmark (no "stay" label), from
// brand-assets/stay lockup compact.svg — same paths and colours, cropped to the
// drawing. v2 balance (2026-11-02): arch −18 %, wordmark +18 %, gap 0.35 × the
// arch's width, the arch centred on the wordmark's optical centre (midway
// between the baseline and the x-height/ascender band). Rendered at 23px — the
// arch's height — so the lockup stays ~the old width (104px vs 97px).
//
// The file NAMES change with the design (homesta-lockup-v2*.svg), so neither
// the CDN nor a browser can answer with a cached older lockup.
//
// width/height MUST track the viewBox: next/image reserves space from them,
// and a stale pair reserves the wrong box and shifts the header as the SVG
// paints (CLS). unoptimized: an SVG is vector — crisp at any density — and the
// optimizer would only pass it through.
export function Wordmark({ className, variant = 'dark' }: WordmarkProps) {
  return (
    <Image
      src={variant === 'light' ? '/brand/homesta-lockup-v2-light.svg' : '/brand/homesta-lockup-v2.svg'}
      alt="Homesta"
      width={2674}
      height={590}
      priority
      unoptimized
      className={cn('h-[23px] w-auto', className)}
    />
  );
}
