'use client';

import trMessages from '../../../messages/tr.json';

/**
 * Last-resort boundary for the owner decision routes.
 *
 * loadDecisionContext already converts every expected failure into a rendered
 * state, so reaching this means something genuinely unforeseen broke. It exists
 * so that even then an owner sees Turkish rather than the default Next.js error
 * screen — the spec's "never a crash, never a blank" has no exceptions.
 *
 * The error object is intentionally never displayed and never logged here: a
 * decision_token can end up inside a stack trace or a request URL, and this
 * component runs in the browser.
 */
export default function OwnerError({ reset }: { error: Error; reset: () => void }) {
  const t = trMessages.ownerDecision;

  return (
    <div className="text-center py-10">
      <h1 className="text-xl font-medium tracking-[-0.025em] text-ink mb-2">{t.errorTitle}</h1>
      <p className="text-sm text-ink-soft leading-relaxed">{t.errorBody}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center justify-center rounded-[999px] bg-ink px-6 py-3 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-80"
      >
        {t.retry}
      </button>
    </div>
  );
}
