import Image from 'next/image';
import { cn } from '@/lib/utils';

interface WordmarkProps {
  className?: string;
  /** 'light' for dark surfaces (the footer): the wordmark in white, the arch unchanged. */
  variant?: 'dark' | 'light';
}

// The brand lockup: the arch + the "homesta" wordmark (no "stay" label), from
// brand-assets/stay lockup compact.svg with its paths and colours unchanged —
// only the viewBox is cropped to the drawing itself (280 0 2499 720), so the
// arch fills the 28px height the old lockup did instead of sitting in the
// source file's padding.
//
// The file NAMES are new (homesta-lockup*.svg), so neither the CDN nor a
// browser can answer with the cached old lockup.
//
// width/height MUST track the viewBox: next/image reserves space from them,
// and a stale pair reserves the wrong box and shifts the header as the SVG
// paints (CLS). unoptimized: an SVG is vector — crisp at any density — and the
// optimizer would only pass it through.
export function Wordmark({ className, variant = 'dark' }: WordmarkProps) {
  return (
    <Image
      src={variant === 'light' ? '/brand/homesta-lockup-light.svg' : '/brand/homesta-lockup.svg'}
      alt="Homesta"
      width={2499}
      height={720}
      priority
      unoptimized
      className={cn('h-7 w-auto', className)}
    />
  );
}
