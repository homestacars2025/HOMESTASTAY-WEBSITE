import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      width="1em"
      height="1em"
      className={cn('inline-block shrink-0', className)}
    >
      <path
        d="M22 100 L 22 60 A 38 38 0 0 1 98 60 L 98 100"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinecap="round"
      />
    </svg>
  );
}
