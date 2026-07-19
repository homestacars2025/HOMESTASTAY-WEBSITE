import { loadDecisionContext } from '@/lib/owner/decision';
import { ownerT } from '@/lib/owner/i18n';
import { BookingSummary } from '@/app/(owner)/_components/BookingSummary';
import { DecisionCountdown } from '@/app/(owner)/_components/DecisionCountdown';
import { DecisionForm } from '@/app/(owner)/_components/DecisionForm';
import { Notice } from '@/app/(owner)/_components/Notice';
import { Wordmark } from '@/components/brand/Wordmark';

/**
 * Step 1 for both /onay and /ret — read-only, server-rendered.
 *
 * The two pages differ only in wording, button colour and whether a refund
 * warning appears. Sharing the body keeps the state handling identical: every
 * DecisionContext case is answered here once, so neither page can grow a hole
 * the other does not have.
 */
export async function DecisionPage({
  token,
  mode,
}: {
  token: string;
  mode: 'approve' | 'reject';
}) {
  const t = ownerT();
  const ctx = await loadDecisionContext(token);

  const header = (
    <div className="flex justify-center mb-8">
      <Wordmark className="h-6 w-auto" />
    </div>
  );

  // ── Terminal states ─────────────────────────────────────────────────────
  // Every one renders a real Turkish page. Never a crash, never a blank.

  if (ctx.state === 'error') {
    // Infrastructure problem, not a bad link. Says "try again", not "invalid".
    return (
      <>
        {header}
        <Notice tone="error" title={t('errorTitle')} body={t('errorBody')} />
      </>
    );
  }

  if (ctx.state === 'not_found') {
    // Covers no such token, malformed token, NULL token and a spent token
    // alike — one message, so the page reveals nothing about which.
    return (
      <>
        {header}
        <Notice tone="error" title={t('invalidTitle')} body={t('invalidBody')} />
      </>
    );
  }

  if (ctx.state === 'already_decided') {
    const decided = ctx.booking.ownerDecision;
    const body =
      decided === 'approved'
        ? t('decidedApproved')
        : decided === 'rejected'
          ? t('decidedRejected')
          : t('decidedExpired');

    const at = ctx.booking.ownerDecidedAt;
    const detail = at
      ? t('decidedAt', {
          date: new Intl.DateTimeFormat('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(at)),
        })
      : null;

    return (
      <>
        {header}
        <Notice tone="neutral" title={t('decidedTitle')} body={body} detail={detail} />
      </>
    );
  }

  if (ctx.state === 'expired') {
    return (
      <>
        {header}
        <Notice tone="warning" title={t('expiredTitle')} body={t('expiredBody')} />
      </>
    );
  }

  if (ctx.state === 'not_hold') {
    return (
      <>
        {header}
        <Notice tone="neutral" title={t('notHoldTitle')} body={t('notHoldBody')} />
      </>
    );
  }

  // ── Actionable ──────────────────────────────────────────────────────────

  const { booking } = ctx;
  const isReject = mode === 'reject';

  return (
    <>
      {header}

      <h1 className="text-xl font-medium tracking-[-0.03em] text-ink text-center">
        {isReject ? t('rejectTitle') : t('approveTitle')}
      </h1>
      <p className="mt-2 text-sm text-ink-soft leading-relaxed text-center">
        {isReject ? t('rejectLead') : t('approveLead')}
      </p>

      {booking.ownerDecisionDueAt && (
        <div className="mt-6">
          <DecisionCountdown
            dueAt={booking.ownerDecisionDueAt}
            labels={{
              title: t('timeLeftLabel'),
              hours: t('timeLeftHours', { hours: '{hours}', minutes: '{minutes}' }),
              minutes: t('timeLeftMinutes', { minutes: '{minutes}', seconds: '{seconds}' }),
              over: t('timeLeftOver'),
            }}
          />
        </div>
      )}

      <BookingSummary
        booking={booking}
        labels={{
          paidBadge: t('paidBadge'),
          unpaidBadge: t('unpaidBadge'),
          paidNote: t('paidNote'),
          unpaidNote: t('unpaidNote'),
          reference: t('reference'),
          unit: t('unit'),
          property: t('property'),
          checkIn: t('checkIn'),
          checkOut: t('checkOut'),
          nightsLabel: t('nightsLabel'),
          nights: t('nights', { count: booking.nights }),
          guests: t('guests'),
          guestCount: t('guestCount', { count: booking.guestsCount ?? 0 }),
          nationality: t('nationality'),
          nationalityUnknown: t('nationalityUnknown'),
          total: t('total'),
        }}
      />

      <DecisionForm
        token={token}
        mode={mode}
        // Rejecting a paid booking moves money. The owner is told so in plain
        // Turkish, directly above the button, before they can press it.
        showRefundWarning={isReject && booking.isPaid}
        labels={{
          button: isReject ? t('rejectButton') : t('approveButton'),
          working: t('working'),
          refundWarning: t('refundWarning'),
          approvedTitle: t('approvedTitle'),
          approvedBody: t('approvedBody'),
          rejectedTitle: t('rejectedTitle'),
          rejectedBody: t('rejectedBody'),
          rejectedRefundTitle: t('rejectedRefundTitle'),
          rejectedRefundBody: t('rejectedRefundBody'),
          errorTitle: t('errorTitle'),
          errorBody: t('errorBody'),
          conflictTitle: t('conflictTitle'),
          conflictBody: t('conflictBody'),
          invalidTitle: t('invalidTitle'),
          invalidBody: t('invalidBody'),
        }}
      />
    </>
  );
}
