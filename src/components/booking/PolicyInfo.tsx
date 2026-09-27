'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import type { UnitCancellationPolicy } from '@/lib/types/unit';

/**
 * The ⓘ beside the cancellation policy's name on the consent line.
 *
 * The guest is agreeing to this policy, so its full wording has to be
 * reachable right there — but printing the whole description inside a consent
 * sentence buries the sentence. Tapping (or hovering, on a pointer device)
 * reveals it in place.
 *
 * The text is the unit's own, from unit_cancellation_policy in the page's
 * language. Nothing about it is composed here.
 *
 * It is a BUTTON, not a link or a bare icon: it toggles content on the same
 * page, it is keyboard-reachable, and aria-expanded says what it does. The
 * title attribute gives the same text to a desktop hover without duplicating
 * a tooltip implementation.
 */
export function PolicyInfo({ policy }: { policy: UnitCancellationPolicy }) {
  const t = useTranslations('booking.documents');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        // Inside a <label>, a click would otherwise toggle the checkbox too.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={t('policyInfo')}
        title={policy.description}
        className="inline-flex items-center justify-center align-middle ms-1 w-6 h-6 rounded-full text-mute hover:text-ink transition-colors duration-[240ms]"
      >
        <Info className="w-4 h-4" aria-hidden />
      </button>

      {open && (
        <span className="block mt-2 rounded-[14px] border border-rule bg-paper-warm/60 p-3 text-[12px] text-ink-soft leading-relaxed">
          {policy.description}
        </span>
      )}
    </>
  );
}
