'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { GuestsStepper } from '@/components/shared/GuestsStepper';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { CountrySelect } from '@/components/booking/CountrySelect';
import { createHoldAction } from '@/app/[locale]/book/[slug]/actions';
import type { HoldFieldError, HoldResult } from '@/app/[locale]/book/[slug]/actions';

/**
 * Lead guest only. Accompanying guests are captured at check-in, so asking for
 * them here would be friction with nothing behind it.
 *
 * Every check in this component is duplicated server-side in createHoldAction
 * and again inside create_booking_hold. This layer exists purely so a guest
 * sees a field highlighted as they type rather than after a round trip — it is
 * not a security boundary and must never be treated as one.
 */

interface GuestDetailsFormProps {
  unitId:      string;
  checkIn:     string;
  checkOut:    string;
  initialGuests: number;
  maxGuests:   number | null;
  /** Minimum stay. The RPC returns a bare 'invalid' for a short stay with no
   *  reason attached, so this is surfaced as a field-level message here. */
  minNights:   number;
  onHeld:      (result: Extract<HoldResult, { ok: true }>) => void;
}

/** Whole nights between two YYYY-MM-DD dates. */
function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE  = /^\+[1-9][0-9]{6,14}$/;

export function GuestDetailsForm({
  unitId,
  checkIn,
  checkOut,
  initialGuests,
  maxGuests,
  minNights,
  onHeld,
}: GuestDetailsFormProps) {
  const t = useTranslations('booking');

  const nights = nightsBetween(checkIn, checkOut);
  const belowMin = nights < minNights;

  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [nationality, setNationality] = useState('');
  const [guests,      setGuests]      = useState(initialGuests);
  const [accepted,    setAccepted]    = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Set<HoldFieldError>>(new Set());
  const [pageError,   setPageError]   = useState<string | null>(null);
  const [ownHold,     setOwnHold]     = useState<{ reference: string } | null>(null);
  const [pending, startTransition]    = useTransition();

  const invalid = (field: HoldFieldError) => fieldErrors.has(field);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPageError(null);
    setOwnHold(null);

    // Dates are fixed by the URL and cannot be edited on this form, so a stay
    // below the minimum can only be corrected back on the listing calendar.
    // The RPC would return a bare 'invalid'; this gives the real reason.
    if (belowMin) {
      setPageError(t('errors.minNights', { count: minNights }));
      return;
    }

    // Client-side pass first, so the obvious mistakes never leave the browser.
    const local = new Set<HoldFieldError>();
    if (!firstName.trim())        local.add('firstName');
    if (!lastName.trim())         local.add('lastName');
    if (!EMAIL_RE.test(email.trim())) local.add('email');
    if (!E164_RE.test(phone.trim())) local.add('phone');
    if (guests < 1)               local.add('guests');
    if (!accepted)                local.add('documents');

    if (local.size > 0) { setFieldErrors(local); return; }
    setFieldErrors(new Set());

    startTransition(async () => {
      const result = await createHoldAction({
        unitId, checkIn, checkOut, guests,
        firstName, lastName, email, phone, nationality,
        documentsAccepted: accepted,
      });

      if (result.ok) { onHeld(result); return; }

      switch (result.status) {
        case 'invalid':
          setFieldErrors(new Set(result.fields));
          if (result.fields.length === 0) {
            // A fieldless 'invalid' from the RPC on a short stay is almost
            // always the min-nights guard — name it rather than saying nothing.
            setPageError(belowMin
              ? t('errors.minNights', { count: minNights })
              : t('errors.invalid'));
          }
          break;
        case 'own_hold':
          // Never "someone took it" — this guest is the one holding it.
          setOwnHold({ reference: result.reference });
          break;
        case 'unavailable':
          setPageError(t('errors.unavailable'));
          break;
        case 'not_bookable':
          setPageError(t('errors.notBookable'));
          break;
        case 'rate_unavailable':
          // We refused to sell rather than charge an unverifiable rate.
          setPageError(t('errors.rateUnavailable'));
          break;
        default:
          setPageError(t('errors.generic'));
      }
    });
  }

  const inputClass = (field: HoldFieldError) =>
    [
      'w-full rounded-[14px] border bg-paper px-4 py-3 text-[15px] text-ink',
      'placeholder:text-mute transition-colors duration-[240ms]',
      'focus:outline-none focus:border-ink',
      invalid(field) ? 'border-stay' : 'border-rule',
    ].join(' ');

  const labelClass =
    'block font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-2';

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Name — two fields, one row on anything above 375px */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className={labelClass}>{t('fields.firstName')}</label>
          <input
            id="firstName" name="firstName" type="text" autoComplete="given-name"
            value={firstName} onChange={(e) => setFirstName(e.target.value)}
            aria-invalid={invalid('firstName')} className={inputClass('firstName')}
          />
        </div>
        <div>
          <label htmlFor="lastName" className={labelClass}>{t('fields.lastName')}</label>
          <input
            id="lastName" name="lastName" type="text" autoComplete="family-name"
            value={lastName} onChange={(e) => setLastName(e.target.value)}
            aria-invalid={invalid('lastName')} className={inputClass('lastName')}
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>{t('fields.email')}</label>
        <input
          id="email" name="email" type="email" inputMode="email" autoComplete="email"
          dir="ltr"
          value={email} onChange={(e) => setEmail(e.target.value)}
          aria-invalid={invalid('email')} className={inputClass('email')}
        />
        {invalid('email') && <FieldNote>{t('errors.email')}</FieldNote>}
      </div>

      <div>
        {/* Reuses the shared PhoneInput (also on sign-up + host). Emits E.164,
            which is exactly what the RPC validates. 'booking' variant matches
            this form's radius and micro-label. */}
        <PhoneInput
          variant="booking"
          defaultCountry="TR"
          value={phone}
          onChange={setPhone}
          label={t('fields.phone')}
          searchPlaceholder={t('fields.searchCountries')}
          invalid={invalid('phone')}
          errorId="phone-error"
        />
        <p className="mt-2 text-xs text-mute">{t('fields.phoneHint')}</p>
        {invalid('phone') && <FieldNote id="phone-error">{t('errors.phone')}</FieldNote>}
      </div>

      {/* Nationality — stores the ISO alpha-2 code, localized names from the
          library. Optional, same as before. */}
      <CountrySelect
        value={nationality}
        onChange={setNationality}
        label={t('fields.nationality')}
        optionalText={t('fields.optional')}
        placeholder={t('fields.nationalityPlaceholder')}
        searchPlaceholder={t('fields.searchCountries')}
      />

      <div className="border-t border-rule pt-5">
        <p className={labelClass}>{t('fields.guests')}</p>
        <GuestsStepper
          value={guests}
          onChange={(next) => setGuests(maxGuests ? Math.min(next, maxGuests) : next)}
          decrementLabel={t('fields.guestsDecrement')}
          incrementLabel={t('fields.guestsIncrement')}
          inputLabel={t('fields.guests')}
        />
        {maxGuests !== null && (
          <p className="mt-2 text-xs text-mute">{t('fields.maxGuests', { count: maxGuests })}</p>
        )}
      </div>

      {/* Distance-selling acceptance — mandatory before payment under Turkish law */}
      <div className="border-t border-rule pt-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox" checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            aria-invalid={invalid('documents')}
            className="mt-[3px] w-[18px] h-[18px] shrink-0 accent-[var(--stay)] cursor-pointer"
          />
          <span className={`text-[13px] leading-relaxed ${invalid('documents') ? 'text-stay' : 'text-ink-soft'}`}>
            {t.rich('documents.label', {
              pre: (chunks) => (
                <Link href="/on-bilgilendirme" target="_blank"
                      className="underline underline-offset-2 hover:text-ink">
                  {chunks}
                </Link>
              ),
              contract: (chunks) => (
                <Link href="/mesafeli-satis" target="_blank"
                      className="underline underline-offset-2 hover:text-ink">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
      </div>

      {ownHold && (
        <Notice>
          {t('errors.ownHold', { reference: ownHold.reference })}
        </Notice>
      )}
      {pageError && <Notice>{pageError}</Notice>}

      <button
        type="submit" disabled={pending}
        className="w-full bg-stay text-white rounded-[999px] py-4 text-sm font-semibold min-h-[44px] transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? t('submitting') : t('submit')}
      </button>

      <p className="text-center text-xs text-mute">{t('noChargeYet')}</p>
    </form>
  );
}

function FieldNote({ id, children }: { id?: string; children: React.ReactNode }) {
  return <p id={id} className="mt-2 text-xs text-stay">{children}</p>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[14px] border border-rule bg-paper-warm px-4 py-3"
    >
      <AlertCircle className="w-4 h-4 mt-[2px] shrink-0 text-ink-soft" aria-hidden />
      <p className="text-[13px] text-ink-soft leading-relaxed">{children}</p>
    </div>
  );
}
