'use client';

import { useRef } from 'react';
import { useRouter } from '@/i18n/navigation';
import { formatSvcParam } from '@/lib/services/selection';
import type { ServiceSelection } from '@/lib/services/types';
import { GuestDetailsForm } from '@/components/booking/GuestDetailsForm';
import type { HoldResult } from '@/app/[locale]/book/[slug]/actions';
import type { BookingAccount } from '@/lib/booking/account';
import type { PaymentModeQuote } from '@/lib/booking/payment-mode';
import type { UnitCancellationPolicy } from '@/lib/types/unit';

/**
 * Thin client shell around the details form.
 *
 * Exists only to own the navigation after a hold succeeds — the page itself
 * is a Server Component and the form needs a router. Keeping it this small
 * means the page stays server-rendered, which matters for Law 1.
 *
 * NOTE: the booking id is NOT passed to the result page. It travels in the
 * signed httpOnly cookie createHoldAction set server-side; the reference in
 * the URL is a display key that the result page authorises against that
 * cookie. A booking reference in a URL must never be sufficient on its own.
 */

interface BookingFlowProps {
  /** null for an anonymous visitor. */
  account:       BookingAccount | null;
  unitId:        string;
  /** URL segment of this checkout (/book/{slug}), for re-quoting in place. */
  slug:          string;
  checkIn:       string;
  checkOut:      string;
  initialGuests: number;
  maxGuests:     number | null;
  minNights:     number;
  /** Priced payment modes for these dates; null when they could not be read. */
  modeQuote:     PaymentModeQuote | null;
  /** The unit's cancellation policy, resolved for this locale. */
  policy:        UnitCancellationPolicy | null;
  /** Extras from the URL, already checked against this unit. */
  services:      ServiceSelection[];
}

export function BookingFlow({
  account,
  unitId,
  slug,
  checkIn,
  checkOut,
  initialGuests,
  maxGuests,
  minNights,
  modeQuote,
  policy,
  services,
}: BookingFlowProps) {
  const router = useRouter();
  const guestsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Per-guest extras, and the deposit that includes them, are priced for a
   * guest count. When the guest changes it here, the URL is updated in place
   * so the page re-quotes on the server — a soft navigation, so everything
   * already typed into the form stays put. Debounced: a few taps on the
   * stepper are one re-quote, not one each. Without extras nothing on the
   * page depends on the count, so nothing happens.
   */
  function handleGuestsChange(guests: number) {
    if (services.length === 0) return;
    if (guestsTimer.current) clearTimeout(guestsTimer.current);
    guestsTimer.current = setTimeout(() => {
      const query = new URLSearchParams({
        from: checkIn, to: checkOut, guests: String(guests), svc: formatSvcParam(services),
      });
      router.replace(`/book/${slug}?${query.toString()}`, { scroll: false });
    }, 400);
  }

  function handleHeld(result: Extract<HoldResult, { ok: true }>) {
    // 'created' and 'resumed' are the same destination on purpose: a guest
    // returning to a hold they already made should land exactly where they
    // left off, not be told something went wrong.
    router.push(`/booking/${encodeURIComponent(result.reference)}`);
  }

  return (
    <GuestDetailsForm
      account={account}
      unitId={unitId}
      checkIn={checkIn}
      checkOut={checkOut}
      initialGuests={initialGuests}
      maxGuests={maxGuests}
      minNights={minNights}
      modeQuote={modeQuote}
      policy={policy}
      onHeld={handleHeld}
      services={services}
      onGuestsChange={handleGuestsChange}
    />
  );
}
