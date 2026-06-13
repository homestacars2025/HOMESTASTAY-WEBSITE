'use client';

import { useState } from 'react';
import { Info, ArrowRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';

interface SampleBarProps {
  /** Which localized line to show. */
  messageKey: 'detailNotice' | 'indexBanner';
  /** Render a dismiss button (detail page). Default false. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Slim warm-paper notice explaining these are pre-launch sample listings,
 * with a CTA to /host. Used above the gallery on the detail page (dismissible)
 * and atop the /stays grid (persistent banner).
 */
export function SampleBar({ messageKey, dismissible = false, className }: SampleBarProps) {
  const t = useTranslations('sample');
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[14px] bg-paper-warm px-4 py-3',
        className,
      )}
    >
      <Info className="w-4 h-4 shrink-0 text-ink-soft" aria-hidden="true" />

      <p className="flex-1 text-sm text-ink-soft leading-snug">
        {t(messageKey)}{' '}
        <Link
          href="/host"
          className="inline-flex items-center gap-0.5 font-medium text-stay whitespace-nowrap hover:opacity-80 transition-opacity duration-[240ms]"
        >
          {t('cta')}
          <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </p>

      {dismissible && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('dismiss')}
          className="shrink-0 -me-1 p-1 text-mute hover:text-ink transition-colors duration-[240ms]"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
