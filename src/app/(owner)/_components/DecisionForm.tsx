'use client';

import { useState, useTransition } from 'react';
import { approveBooking, rejectBooking, type DecisionResult } from '@/lib/owner/actions';
import { Notice } from '@/app/(owner)/_components/Notice';

export interface DecisionFormLabels {
  button: string;
  working: string;
  refundWarning: string;
  approvedTitle: string;
  approvedBody: string;
  rejectedTitle: string;
  rejectedBody: string;
  rejectedRefundTitle: string;
  rejectedRefundBody: string;
  errorTitle: string;
  errorBody: string;
  conflictTitle: string;
  conflictBody: string;
  invalidTitle: string;
  invalidBody: string;
}

/**
 * Step 2 of the two-step flow: the explicit confirm.
 *
 * Step 1 (the GET that rendered this page) is strictly read-only. WhatsApp
 * fetches a preview for every link it renders, scanners follow URLs, and thumbs
 * slip — none of those may decide a booking. Only this button mutates, and only
 * on a real POST.
 *
 * The result replaces the form in place rather than navigating. The action
 * clears decision_token, so the URL is spent the moment it succeeds; a redirect
 * back to it would resolve to "invalid link" and read as a failure.
 */
export function DecisionForm({
  token,
  mode,
  labels,
  showRefundWarning,
}: {
  token: string;
  mode: 'approve' | 'reject';
  labels: DecisionFormLabels;
  showRefundWarning: boolean;
}) {
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (isPending || result) return;
    startTransition(async () => {
      try {
        const r = mode === 'approve' ? await approveBooking(token) : await rejectBooking(token);
        setResult(r);
      } catch {
        // Never surface the thrown value — it can carry request context.
        setResult({ ok: false, reason: 'error' });
      }
    });
  }

  if (result) {
    if (result.ok) {
      if (result.kind === 'approved') {
        return <Notice tone="success" title={labels.approvedTitle} body={labels.approvedBody} />;
      }
      if (result.kind === 'rejected') {
        return <Notice tone="neutral" title={labels.rejectedTitle} body={labels.rejectedBody} />;
      }
      // Paid: decision is recorded, the money has not moved yet.
      return (
        <Notice
          tone="warning"
          title={labels.rejectedRefundTitle}
          body={labels.rejectedRefundBody}
        />
      );
    }

    const map = {
      conflict: { title: labels.conflictTitle, body: labels.conflictBody },
      invalid: { title: labels.invalidTitle, body: labels.invalidBody },
      error: { title: labels.errorTitle, body: labels.errorBody },
    } as const;
    const copy = map[result.reason];
    return <Notice tone="error" title={copy.title} body={copy.body} />;
  }

  const isReject = mode === 'reject';

  return (
    <div className="mt-6">
      {showRefundWarning && (
        <p className="mb-4 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          {labels.refundWarning}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        // 52px tall: comfortably past the 44px touch-target floor, on a page
        // where a mis-tap is expensive.
        className={`w-full rounded-[999px] py-4 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed ${
          isReject ? 'bg-ink' : 'bg-stay'
        }`}
      >
        {isPending ? labels.working : labels.button}
      </button>
    </div>
  );
}
