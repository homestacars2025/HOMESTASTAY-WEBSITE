import type { OwnerBooking } from '@/lib/owner/decision';

/**
 * The facts an owner needs to decide, in the order they need them.
 *
 * Payment status is deliberately the largest element on the page: whether the
 * money is already held is what changes the meaning of "Reddet" from "release
 * the dates" to "give a guest their money back".
 */
export function BookingSummary({
  booking,
  labels,
}: {
  booking: OwnerBooking;
  labels: {
    paidBadge: string;
    unpaidBadge: string;
    paidNote: string;
    unpaidNote: string;
    reference: string;
    unit: string;
    property: string;
    checkIn: string;
    checkOut: string;
    nightsLabel: string;
    nights: string;
    guests: string;
    guestCount: string;
    nationality: string;
    nationalityUnknown: string;
    total: string;
  };
}) {
  // tr-TR throughout: this page has exactly one audience and one language.
  const date = (iso: string) =>
    new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${iso}T00:00:00`));

  const money = (amount: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(amount);

  const rows: Array<[string, string]> = [
    [labels.reference, booking.bookingReference ?? '—'],
    [labels.property, booking.propertyName ?? '—'],
    [labels.unit, booking.unitName ?? '—'],
    [labels.checkIn, date(booking.checkIn)],
    [labels.checkOut, date(booking.checkOut)],
    [labels.nightsLabel, labels.nights],
    [labels.guests, booking.guestsCount === null ? '—' : labels.guestCount],
    [labels.nationality, booking.guestNationality ?? labels.nationalityUnknown],
  ];

  return (
    <div className="mt-6">
      {/* Payment status — the most prominent element on the page */}
      <div
        className={`rounded-[14px] px-4 py-4 text-center mb-5 ${
          booking.isPaid
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-amber-50 border border-amber-200'
        }`}
      >
        <p
          className={`font-mono text-sm font-semibold uppercase tracking-[0.08em] ${
            booking.isPaid ? 'text-emerald-700' : 'text-amber-700'
          }`}
        >
          {booking.isPaid ? labels.paidBadge : labels.unpaidBadge}
        </p>
        <p
          className={`mt-1.5 text-xs leading-relaxed ${
            booking.isPaid ? 'text-emerald-800/80' : 'text-amber-800/80'
          }`}
        >
          {booking.isPaid ? labels.paidNote : labels.unpaidNote}
        </p>
      </div>

      <dl className="border border-rule rounded-[14px] overflow-hidden text-sm">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex items-start justify-between gap-4 px-4 py-3 ${
              i > 0 ? 'border-t border-rule' : ''
            }`}
          >
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute pt-0.5 shrink-0">
              {label}
            </dt>
            <dd className="text-ink text-end break-words">{value}</dd>
          </div>
        ))}

        {booking.totalAmountUsd !== null && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-rule bg-paper-warm/40">
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
              {labels.total}
            </dt>
            <dd className="text-stay font-semibold text-base tabular-nums">
              {money(booking.totalAmountUsd)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
