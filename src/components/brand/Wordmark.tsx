import Image from 'next/image';
import { cn } from '@/lib/utils';

interface WordmarkProps {
  className?: string;
}

// Full brand lockup SVG (icon + "homesta stay" wordmark).
// The logo is served from public/brand/; viewBox is 793×250 (ratio ≈ 3.17:1).
// unoptimized: Next.js image optimizer passes SVGs through unchanged.
export function Wordmark({ className }: WordmarkProps) {
  return (
    <Image
      src="/brand/stay-lockup-compact.svg"
      alt="Homesta Stay"
      width={793}
      height={250}
      priority
      unoptimized
      className={cn('h-7 w-auto', className)}
    />
  );
}
