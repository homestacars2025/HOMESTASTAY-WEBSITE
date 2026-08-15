'use client';

import { useRouter } from '@/i18n/navigation';
import { GuestDetailsForm } from '@/components/booking/GuestDetailsForm';
import type { HoldResult } from '@/app/[locale]/book/[slug]/actions';
import type { BookingAccount } from '@/lib/booking/account';

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
  checkIn:       string;
  checkOut:      string;
  initialGuests: number;
  maxGuests:     number | null;
  minNights:     number;
}

export function BookingFlow({
  account,
  unitId,
  checkIn,
  checkOut,
  initialGuests,
  maxGuests,
  minNights,
}: BookingFlowProps) {
  const router = useRouter();

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
      onHeld={handleHeld}
    />
  );
}
