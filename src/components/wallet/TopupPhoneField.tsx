'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PhoneInput } from '@/components/auth/PhoneInput';

/**
 * The phone field on both top-up payment forms.
 *
 * WHY A WRAPPER AND NOT PhoneInput DIRECTLY
 *   PhoneInput is a controlled component — it reports E.164 through onChange
 *   and renders no named field of its own, because every other form using it
 *   submits through a Server Action that already holds the value in state. The
 *   top-up forms POST natively to a Route Handler, so the value has to exist as
 *   a real form field. This holds the state and mirrors it into a hidden input
 *   the browser will actually send.
 *
 * WHY IT REPLACED A PLAIN <input type="tel">
 *   The plain input worked and needed no JavaScript, which suited the rest of
 *   those forms. But it asked a guest to type '+90…' from memory, while this
 *   codebase already has a field with every country, its flag and a search box.
 *   Reusing it costs a client component on this one field; typing a calling
 *   code by hand costs the guest a failed payment.
 *
 * VALIDATION IS STILL THE ROUTE'S. The hidden input carries whatever E.164 the
 * component produced, and both start routes reject anything that is not
 * /^\+[1-9][0-9]{6,14}$/ before a gateway is contacted. Nothing here is a
 * boundary.
 */

interface TopupPhoneFieldProps {
  /** From profiles.phone. Prefills country + number when it parses. */
  initialPhone: string;
}

export function TopupPhoneField({ initialPhone }: TopupPhoneFieldProps) {
  const t = useTranslations('wallet.topup');
  const tAuth = useTranslations('auth.signUp');

  const [phone, setPhone] = useState(initialPhone);

  return (
    <div>
      <PhoneInput
        variant="booking"
        value={phone}
        onChange={setPhone}
        initialValue={initialPhone}
        defaultCountry="TR"
        label={t('phoneLabel')}
        // The country-search placeholder already exists in all four locales
        // for sign-up; a second key with the same words would be two things to
        // keep in step.
        searchPlaceholder={tAuth('phoneSearchPlaceholder')}
      />

      <input type="hidden" name="phone" value={phone} />

      <p className="mt-2 text-xs leading-relaxed text-mute">{t('phoneHint')}</p>
    </div>
  );
}
