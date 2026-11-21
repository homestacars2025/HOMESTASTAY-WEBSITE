'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Minus, Plane, PlaneLanding, PlaneTakeoff, Plus, Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { createTransferAction, quoteTransferAction, type BookResult } from '@/app/[locale]/transfers/actions';
import {
  formatMoney, localName, type Airport, type Direction, type TransferOptions,
} from '@/lib/transfers/model';

/**
 * The website's transfer booking, one step per screen (mobile first):
 * airport → direction → district (with price) → date/time + flight →
 * passengers / luggage / child seats → contact → summary → Pay.
 *
 * Prices shown are the database's (transfer_options "from", then the exact
 * transfer_quote); the one that is charged is set by transfer_create /
 * transfer_payment_init. The draft lives in sessionStorage so a sign-in in the
 * middle (contact step) comes back to the same place.
 */

type Step = 'airport' | 'direction' | 'district' | 'when' | 'party' | 'contact' | 'summary';
const STEPS: Step[] = ['airport', 'direction', 'district', 'when', 'party', 'contact', 'summary'];
const DRAFT_KEY = 'hs_transfer_draft';

interface Draft {
  step: Step;
  airport: Airport | null;
  direction: Direction | null;
  districtId: string | null;
  address: string;
  date: string;
  time: string;
  flightNumber: string;
  passengers: number;
  luggage: number;
  childSeats: number;
  name: string;
  phone: string;
  notes: string;
  savedAt: number;
}

const EMPTY: Draft = {
  step: 'airport', airport: null, direction: null, districtId: null, address: '', date: '', time: '',
  flightNumber: '', passengers: 1, luggage: 1, childSeats: 0, name: '', phone: '', notes: '', savedAt: 0,
};

type Props = {
  options: TransferOptions;
  signedIn: boolean;
  prefill: { name: string; phone: string };
  stayBookingId?: string;
};

/** Today in Istanbul, as yyyy-mm-dd (the date input's min). */
function istanbulToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function TransferBooking({ options, signedIn, prefill, stayBookingId }: Props) {
  const t = useTranslations('transfers.book');
  const locale = useLocale();
  const router = useRouter();
  const [d, setD] = useState<Draft>({ ...EMPTY, name: prefill.name, phone: prefill.phone });
  const [quote, setQuote] = useState<{ usd: number; try: number | null } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const top = useRef<HTMLDivElement>(null);

  // Resume a draft from this tab (e.g. after signing in at the contact step).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
      if (saved && Date.now() - saved.savedAt < 60 * 60 * 1000) {
        setD({ ...saved, name: saved.name || prefill.name, phone: saved.phone || prefill.phone });
      }
    } catch { /* storage blocked — start fresh */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() })); } catch { /* ignore */ }
  }, [d]);

  // The exact price, whenever the route is complete.
  useEffect(() => {
    if (!d.airport || !d.direction || !d.districtId) { setQuote(null); return; }
    let live = true;
    setQuoting(true);
    quoteTransferAction(d.airport, d.direction, d.districtId)
      .then((q) => { if (live) setQuote(q.status === 'ok' ? { usd: q.priceUsd, try: q.priceTry } : null); })
      .finally(() => { if (live) setQuoting(false); });
    return () => { live = false; };
  }, [d.airport, d.direction, d.districtId]);

  const set = (patch: Partial<Draft>) => { setError(''); setD((x) => ({ ...x, ...patch })); };
  // Each step starts at the top of the steps (not of the page: the intro above stays out of the way).
  const go = (step: Step) => { setError(''); setD((x) => ({ ...x, step })); top.current?.scrollIntoView({ block: 'start' }); };
  const index = STEPS.indexOf(d.step);
  const back = () => index > 0 && go(STEPS[index - 1]);

  const airport = options.airports.find((a) => a.code === d.airport);
  const airportName = airport ? localName(airport, locale, airport.code) : '';
  const district = options.districts.find((x) => x.id === d.districtId);
  const districts = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return options.districts
      .filter((x) => !d.airport || x.priceFrom[d.airport] !== undefined)
      .filter((x) => !q || x.name.toLocaleLowerCase('tr').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [options.districts, d.airport, query]);

  // ── Validation per step ───────────────────────────────────────────────────
  function whenError(): string {
    if (!d.date || !d.time) return t('errors.when');
    const at = new Date(`${d.date}T${d.time}:00+03:00`).getTime();
    if (!Number.isFinite(at) || at < Date.now() + options.minLeadHours * 3600_000) return t('errors.tooSoon', { hours: options.minLeadHours });
    if (d.flightNumber && !/^[A-Za-z0-9]{2,3}\s?[0-9]{1,5}[A-Za-z]?$/.test(d.flightNumber.trim())) return t('errors.flight');
    return '';
  }

  function next() {
    if (d.step === 'when') { const e = whenError(); if (e) { setError(e); return; } }
    if (d.step === 'contact') {
      if (d.name.trim().length < 2 || !/^\+[1-9][0-9]{6,14}$/.test(d.phone)) { setError(t('errors.contact')); return; }
    }
    go(STEPS[index + 1]);
  }

  function signIn() {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() })); } catch { /* ignore */ }
    const back = `/transfers${stayBookingId ? `?stay=${stayBookingId}` : ''}`;
    router.push(`/sign-in?returnUrl=${encodeURIComponent(back)}`);
  }

  function pay() {
    if (!d.airport || !d.direction || !d.districtId) return;
    start(async () => {
      const r: BookResult = await createTransferAction({
        airport: d.airport!, direction: d.direction!, districtId: d.districtId!, address: d.address, date: d.date, time: d.time,
        flightNumber: d.flightNumber, passengers: d.passengers, luggage: d.luggage, childSeats: d.childSeats,
        name: d.name, phone: d.phone, notes: d.notes, lang: locale, stayBookingId,
      }).catch(() => ({ status: 'error' as const }));
      if (r.status === 'ok') {
        try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        router.push(`/transfers/pay/${r.transferId}`);
        return;
      }
      if (r.status === 'auth_required') { signIn(); return; }
      if (r.status === 'too_soon') { setError(t('errors.tooSoon', { hours: r.minLeadHours ?? options.minLeadHours })); return; }
      if (r.status === 'invalid') { setError(t('errors.invalid')); return; }
      setError(t(r.status === 'not_served' ? 'errors.notServed' : r.status === 'rate_limited' ? 'errors.rateLimited' : 'errors.generic'));
    });
  }

  const priceLabel = quote ? formatMoney(quote.usd, 'USD', locale) : '';
  const canNext =
    (d.step === 'district' && Boolean(d.districtId) && Boolean(quote)) ||
    d.step === 'when' || d.step === 'party' || (d.step === 'contact' && signedIn);

  const choice = (on: boolean) =>
    `flex w-full min-h-16 items-center gap-3 rounded-[14px] border p-4 text-start transition-colors duration-[240ms] ${
      on ? 'border-ink bg-paper-warm' : 'border-rule bg-white hover:border-ink-soft'
    }`;
  const input = 'w-full rounded-[14px] border border-rule bg-white px-4 py-3 text-[15px] text-ink placeholder:text-mute focus:border-ink focus:outline-none';
  const label = 'mb-2 block font-mono text-[10px] uppercase tracking-[0.1em] text-mute rtl:font-sans rtl:tracking-normal';

  return (
    <div ref={top} className="scroll-mt-20 pb-28">
      {/* Progress + back */}
      <div className="mb-6 flex items-center gap-3">
        {index > 0 && (
          <button type="button" onClick={back} aria-label={t('back')} className="flex h-11 w-11 items-center justify-center rounded-full border border-rule text-ink">
            <ArrowLeft size={18} className="rtl:rotate-180" aria-hidden="true" />
          </button>
        )}
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute rtl:font-sans rtl:tracking-normal">
          {t('progress', { n: index + 1, total: STEPS.length })}
        </p>
      </div>

      <h2 className="mb-5 text-xl font-medium tracking-[-0.025em] text-ink">{t(`steps.${d.step}`)}</h2>

      {d.step === 'airport' && (
        <div className="flex flex-col gap-3">
          {options.airports.map((a) => (
            <button key={a.code} type="button" className={choice(d.airport === a.code)}
              onClick={() => { set({ airport: a.code, districtId: null }); go('direction'); }}>
              <Plane size={20} strokeWidth={1.75} className="shrink-0 text-ink" aria-hidden="true" />
              <span className="text-[15px] font-medium text-ink">{localName(a, locale, a.code)}</span>
            </button>
          ))}
        </div>
      )}

      {d.step === 'direction' && (
        <div className="flex flex-col gap-3">
          {(['arrival', 'departure'] as Direction[]).map((dir) => (
            <button key={dir} type="button" className={choice(d.direction === dir)}
              onClick={() => { set({ direction: dir }); go('district'); }}>
              {dir === 'arrival'
                ? <PlaneLanding size={20} strokeWidth={1.75} className="shrink-0 text-ink" aria-hidden="true" />
                : <PlaneTakeoff size={20} strokeWidth={1.75} className="shrink-0 text-ink" aria-hidden="true" />}
              <span className="flex flex-col">
                <span className="text-[15px] font-medium text-ink">{t(`direction.${dir}`)}</span>
                <span className="text-sm text-mute">{t(`direction.${dir}Sub`, { airport: airportName })}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {d.step === 'district' && (
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-mute" aria-hidden="true" />
            <input className={`${input} ps-10`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('districtSearch')} aria-label={t('districtSearch')} />
          </div>
          <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-[14px] border border-rule bg-white">
            {districts.map((x) => {
              const from = d.airport ? x.priceFrom[d.airport] : undefined;
              const on = x.id === d.districtId;
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => set({ districtId: x.id })}
                    className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-rule px-4 py-3 text-start last:border-b-0 ${on ? 'bg-paper-warm' : ''}`}>
                    <span className="text-[15px] text-ink">{x.name}</span>
                    {from !== undefined && <span className="shrink-0 text-sm text-mute tabular-nums">{t('from', { price: formatMoney(from, 'USD', locale) })}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {district && (
            <>
              <p className="text-sm text-ink-soft">
                {quoting ? t('quoting') : quote ? <>{t('price')}: <span className="font-semibold text-stay">{priceLabel}</span></> : t('errors.notServed')}
              </p>
              <div>
                <label className={label} htmlFor="tr-address">{t(d.direction === 'departure' ? 'addressPickup' : 'addressDropoff')}</label>
                <input id="tr-address" className={input} value={d.address} maxLength={300} onChange={(e) => set({ address: e.target.value })} placeholder={t('addressPlaceholder')} />
              </div>
            </>
          )}
        </div>
      )}

      {d.step === 'when' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="tr-date">{t('date')}</label>
              <input id="tr-date" type="date" className={input} min={istanbulToday()} value={d.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="tr-time">{t(d.direction === 'arrival' ? 'timeLanding' : 'timePickup')}</label>
              <input id="tr-time" type="time" className={input} value={d.time} onChange={(e) => set({ time: e.target.value })} />
            </div>
          </div>
          <p className="text-sm text-mute">{t('istanbulTimeNote', { hours: options.minLeadHours })}</p>
          <div>
            <label className={label} htmlFor="tr-flight">{t('flight')}</label>
            <input id="tr-flight" dir="ltr" className={input} value={d.flightNumber} maxLength={12} autoCapitalize="characters" onChange={(e) => set({ flightNumber: e.target.value })} placeholder="TK 1234" />
            <p className="mt-1.5 text-sm text-mute">{t(d.direction === 'arrival' ? 'flightNoteArrival' : 'flightNoteDeparture')}</p>
          </div>
        </div>
      )}

      {d.step === 'party' && (
        <div className="flex flex-col divide-y divide-rule rounded-[14px] border border-rule bg-white">
          <Stepper label={t('passengers')} value={d.passengers} min={1} max={options.maxPassengers} onChange={(v) => set({ passengers: v })} />
          <Stepper label={t('luggage')} value={d.luggage} min={0} max={options.maxLuggage} onChange={(v) => set({ luggage: v })} />
          <Stepper label={t('childSeats')} hint={t('childSeatsHint')} value={d.childSeats} min={0} max={options.maxChildSeats} onChange={(v) => set({ childSeats: v })} />
        </div>
      )}

      {d.step === 'contact' && (
        signedIn ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className={label} htmlFor="tr-name">{t('name')}</label>
              <input id="tr-name" className={input} value={d.name} maxLength={120} autoComplete="name" onChange={(e) => set({ name: e.target.value })} />
            </div>
            <PhoneInput value={d.phone} initialValue={d.phone || undefined} onChange={(v) => set({ phone: v })}
              label={t('phone')} searchPlaceholder={t('phoneSearch')} variant="booking" />
            <p className="-mt-2 text-sm text-mute">{t('phoneNote')}</p>
            <div>
              <label className={label} htmlFor="tr-notes">{t('notes')}</label>
              <textarea id="tr-notes" className={`${input} min-h-24`} value={d.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} placeholder={t('notesPlaceholder')} />
            </div>
          </div>
        ) : (
          <div className="rounded-[14px] border border-rule bg-white p-5">
            <p className="mb-4 text-ink-soft">{t('signInBody')}</p>
            <button type="button" onClick={signIn} className="inline-flex min-h-12 w-full items-center justify-center rounded-[999px] bg-ink px-8 font-medium text-white">
              {t('signIn')}
            </button>
          </div>
        )
      )}

      {d.step === 'summary' && (
        <div className="flex flex-col gap-4 rounded-[14px] border border-rule bg-white p-5 text-[15px]">
          <p className="font-medium text-ink">
            {d.direction === 'departure' ? `${district?.name ?? ''} → ${airportName}` : `${airportName} → ${district?.name ?? ''}`}
          </p>
          {d.address && <p className="text-ink-soft">{d.address}</p>}
          <p className="text-ink-soft">
            {d.date} · {d.time} <span className="text-mute">({t('istanbulTime')})</span>
            {d.flightNumber && <> · {d.flightNumber.toUpperCase()}</>}
          </p>
          <p className="text-ink-soft">{t('partyLine', { p: d.passengers, l: d.luggage, c: d.childSeats })}</p>
          <p className="text-ink-soft">{d.name} · <span dir="ltr">{d.phone}</span></p>
          <div className="flex items-baseline justify-between border-t border-rule pt-4">
            <span className="text-ink-soft">{t('total')}</span>
            <span className="text-end">
              <span className="block text-xl font-semibold text-stay tabular-nums">{priceLabel}</span>
              {quote?.try ? <span className="text-xs text-mute">≈ {formatMoney(quote.try, 'TRY', locale)}</span> : null}
            </span>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-ink-soft">
            <li>{t('fullPayment')}</li>
            <li>{t('freeCancel', { hours: options.freeCancelHours })}</li>
          </ul>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-stay">{error}</p>}

      {/* The one primary action, anchored to the bottom on mobile. */}
      {(canNext || d.step === 'summary') && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-white/95 p-4 backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0">
          <button type="button" disabled={pending} onClick={d.step === 'summary' ? pay : next}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[999px] bg-stay px-8 text-base font-medium text-white disabled:opacity-60">
            {d.step === 'summary' ? (pending ? t('creating') : t('pay', { price: priceLabel })) : t('continue')}
          </button>
        </div>
      )}
    </div>
  );
}

function Stepper({ label, hint, value, min, max, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  const btn = 'flex h-11 w-11 items-center justify-center rounded-full border border-rule text-ink disabled:opacity-30';
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <span className="flex flex-col">
        <span className="text-[15px] text-ink">{label}</span>
        {hint && <span className="text-sm text-mute">{hint}</span>}
      </span>
      <span className="flex items-center gap-3">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} −`}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <span className="w-6 text-center tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label} +`}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
