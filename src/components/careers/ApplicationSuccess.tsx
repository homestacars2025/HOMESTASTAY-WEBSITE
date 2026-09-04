'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { FadeUp } from '@/components/motion/FadeUp';

/**
 * The confirmation.
 *
 * This is the last thing an applicant sees and the only proof they have that
 * anything happened, so it gets the whole viewport rather than a toast — a
 * message that can be missed is not a confirmation.
 *
 * NO REFERENCE NUMBER IS SHOWN. The Edge Function returns applicant_id, but it
 * is a UUID: unmemorable, unquotable over the phone, and meaningless to the
 * person reading it. Showing it would look like something they must keep.
 */

interface ApplicationSuccessProps {
  /** The role they applied to, so the page still says what happened. */
  title: string;
}

export function ApplicationSuccess({ title }: ApplicationSuccessProps) {
  const t = useTranslations('careers.success');

  return (
    // FadeUp is the site's existing entrance (framer-motion, already bundled),
    // so this arrives on the same beat as every other section rather than with
    // a one-off keyframe invented for this screen.
    <FadeUp className="flex flex-col items-center px-4 py-16 text-center md:py-24">
      <div role="status" aria-live="polite" className="flex flex-col items-center">
      {/* The accent earns its moment here — a confirmation is exactly what
          Law 4 reserves it for. */}
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stay/10">
        <Check className="h-7 w-7 text-stay" strokeWidth={2.5} aria-hidden />
      </span>

      <h1 className="mt-8 text-[clamp(1.5rem,4.5vw,2.25rem)] font-medium leading-[1.05] tracking-[-0.04em] text-ink">
        {t('title')}
      </h1>

      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-soft">
        {t('body', { title })}
      </p>

      <p className="mt-3 max-w-sm text-sm leading-relaxed text-mute">
        {t('note')}
      </p>
      </div>
    </FadeUp>
  );
}
