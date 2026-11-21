import { getTranslations } from 'next-intl/server';
import { ArrowDown, Baby, Briefcase, Clock, Plane, Users } from 'lucide-react';
import { formatIstanbul, formatMoney, localName, type TransferOptions, type TransferView } from '@/lib/transfers/model';

/**
 * A transfer at a glance: the route (airport ↔ district), the pickup time in
 * Istanbul time, the flight, who and what is travelling. Server component —
 * shared by the payment page, the result page and My transfers.
 */
export async function TransferSummary({
  transfer, options, locale, showPrice = true,
}: {
  transfer: TransferView;
  options: TransferOptions | null;
  locale: string;
  showPrice?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'transfers.summary' });
  const airport = options?.airports.find((a) => a.code === transfer.airport);
  const airportName = airport ? localName(airport, locale, transfer.airport ?? '') : transfer.airport ?? '';
  const place = [transfer.district, transfer.address].filter(Boolean).join(' — ');
  const [from, to] = transfer.direction === 'departure' ? [place, airportName] : [airportName, place];

  return (
    <section className="rounded-[14px] border border-rule bg-white p-5">
      {(from || to) && (
        <div className="mb-4 flex flex-col gap-1">
          <p className="text-[15px] font-medium text-ink">{from}</p>
          <ArrowDown size={16} strokeWidth={1.75} className="text-mute" aria-hidden="true" />
          <p className="text-[15px] font-medium text-ink">{to}</p>
        </div>
      )}
      <dl className="grid grid-cols-1 gap-2.5 text-sm">
        {transfer.pickupAt && (
          <Row icon={<Clock size={16} strokeWidth={1.75} aria-hidden="true" />} label={t(transfer.direction === 'arrival' ? 'landing' : 'pickup')}>
            {formatIstanbul(transfer.pickupAt, locale)} <span className="text-mute">({t('istanbulTime')})</span>
          </Row>
        )}
        {transfer.flightNumber && (
          <Row icon={<Plane size={16} strokeWidth={1.75} aria-hidden="true" />} label={t('flight')}>{transfer.flightNumber}</Row>
        )}
        {transfer.passengers !== null && (
          <Row icon={<Users size={16} strokeWidth={1.75} aria-hidden="true" />} label={t('passengers')}>{transfer.passengers}</Row>
        )}
        {transfer.luggage !== null && (
          <Row icon={<Briefcase size={16} strokeWidth={1.75} aria-hidden="true" />} label={t('luggage')}>{transfer.luggage}</Row>
        )}
        {transfer.childSeats !== null && transfer.childSeats > 0 && (
          <Row icon={<Baby size={16} strokeWidth={1.75} aria-hidden="true" />} label={t('childSeats')}>{transfer.childSeats}</Row>
        )}
      </dl>
      {showPrice && transfer.priceUsd !== null && (
        <p className="mt-4 flex items-baseline justify-between border-t border-rule pt-4">
          <span className="text-sm text-ink-soft">{t('total')}</span>
          <span className="text-lg font-semibold text-stay tabular-nums">{formatMoney(transfer.priceUsd, 'USD', locale)}</span>
        </p>
      )}
    </section>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-mute">{icon}</span>
      <dt className="text-mute">{label}:</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
