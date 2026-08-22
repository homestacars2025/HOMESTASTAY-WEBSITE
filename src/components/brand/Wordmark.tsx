import Image from 'next/image';
import { cn } from '@/lib/utils';

interface WordmarkProps {
  className?: string;
}

// Full brand lockup SVG (icon + "homesta stay" wordmark).
// The logo is served from public/brand/; viewBox is 834×250 (ratio ≈ 3.34:1).
// These MUST track the file: next/image reserves space from them, and a stale
// pair reserves the wrong box and shifts the header as the SVG paints (CLS).
// The viewBox grew from 793 when the mark/wordmark gap was widened.
// unoptimized: Next.js image optimizer passes SVGs through unchanged.
export function Wordmark({ className }: WordmarkProps) {
  return (
    <Image
      src="/brand/stay-lockup-compact.svg"
      alt="Homesta Stay"
      width={834}
      height={250}
      priority
      unoptimized
      className={cn('h-7 w-auto', className)}
    />
  );
}
