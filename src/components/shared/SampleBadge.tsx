import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface SampleBadgeProps {
  /** Extra classes — e.g. absolute positioning when overlaid on a card image. */
  className?: string;
}

/**
 * Elegant "SAMPLE LISTING" pill for pre-launch demo listings.
 * Ink @ ~80% opacity, white Geist Mono caps — matches the brand system.
 * Server-compatible: next-intl's useTranslations is isomorphic.
 */
export function SampleBadge({ className }: SampleBadgeProps) {
  const t = useTranslations('sample');

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[999px] bg-ink/80 backdrop-blur-sm',
        'px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-white',
        className,
      )}
    >
      {t('badge')}
    </span>
  );
}
