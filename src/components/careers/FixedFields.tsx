'use client';

import { useTranslations } from 'next-intl';
import { CountrySelect } from '@/components/booking/CountrySelect';
import { CitySelect } from '@/components/careers/CitySelect';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { AGE_MAX, AGE_MIN, type FieldErrorKey, type FixedValues } from '@/lib/careers/validate';

/**
 * The seven fields every application carries, whatever the opening asks.
 *
 * TWO REUSED COMPONENTS, ON PURPOSE:
 *   CountrySelect gives ~250 nationalities with tr/ar/en/ru names from
 *   react-phone-number-input — already in the bundle for PhoneInput — and
 *   emits an ISO alpha-2 code, which is what the Edge Function stores.
 *   PhoneInput emits E.164 with a country picker. Rebuilding either would be
 *   two more lists to keep correct in four languages.
 *
 * ⚠️ PHONE AND EMAIL ARE ONE RULE, NOT TWO. At least one must be present, so
 * the error belongs to the pair and is rendered under both — putting it under
 * one box would tell the applicant to fix the field they deliberately left
 * blank.
 *
 * ⚠️ RESIDENCE CITY AND DISTRICT STORE A LATIN VALUE, NOT THE LABEL SHOWN.
 * CitySelect displays "إسطنبول" / "İstanbul" / "Стамбул" and stores "Istanbul"
 * in every locale, so the district gate and the stored spelling never depend
 * on the applicant's language. The district field appears only for Istanbul,
 * and the parent clears it whenever the city changes — see ApplicationForm's
 * setFixedValue, which is the guard that stops an Istanbul district being
 * submitted against Ankara.
 */

const INPUT =
  'w-full bg-white border rounded-[10px] px-4 py-3 text-sm text-ink ' +
  'placeholder:text-mute transition-[border-color] duration-[240ms] ' +
  'focus:outline-none focus:border-ink-soft';

interface FixedFieldsProps {
  values: FixedValues;
  onChange: <K extends keyof FixedValues>(key: K, value: FixedValues[K]) => void;
  errors: Set<FieldErrorKey>;
}

export function FixedFields({ values, onChange, errors }: FixedFieldsProps) {
  const t = useTranslations('careers.form');

  const contactInvalid = errors.has('contact');
  const border = (invalid: boolean) => (invalid ? 'border-stay' : 'border-rule');

  return (
    <div className="flex flex-col gap-5">
      {/* Full name — the only unconditionally required field */}
      <div>
        <label htmlFor="full_name" className="mb-1.5 block text-sm font-medium text-ink">
          {t('fullName')}
          <span className="text-stay ms-0.5" aria-hidden> *</span>
        </label>
        <input
          id="full_name"
          type="text"
          autoComplete="name"
          value={values.fullName}
          onChange={(e) => onChange('fullName', e.target.value)}
          aria-invalid={errors.has('full_name')}
          aria-describedby={errors.has('full_name') ? 'full_name-error' : undefined}
          className={`${INPUT} ${border(errors.has('full_name'))}`}
        />
        {errors.has('full_name') && (
          <p id="full_name-error" role="alert" className="mt-1 text-xs text-stay">
            {t('errorRequired')}
          </p>
        )}
      </div>

      {/* Phone + email — one rule across two boxes */}
      <div className="flex flex-col gap-5">
        <div>
          {/* variant="booking" matches the 14px radius and mono micro-label the
              rest of this form uses; the default 'auth' variant is squarer. */}
          <PhoneInput
            value={values.phone}
            onChange={(e164) => onChange('phone', e164)}
            label={t('phone')}
            variant="booking"
            invalid={contactInvalid}
            errorId="contact-error"
            searchPlaceholder={t('countrySearch')}
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
            {t('email')}
            <span className="ms-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
              {t('optional')}
            </span>
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            value={values.email}
            onChange={(e) => onChange('email', e.target.value)}
            aria-invalid={contactInvalid}
            aria-describedby={contactInvalid ? 'contact-error' : undefined}
            className={`${INPUT} ${border(contactInvalid)}`}
          />
        </div>

        {/* One message, once, for the pair. */}
        {contactInvalid && (
          <p id="contact-error" role="alert" className="-mt-2 text-xs text-stay">
            {t('errorContact')}
          </p>
        )}
      </div>

      {/* Age — optional, but a present value must be sane */}
      <div>
        <label htmlFor="age" className="mb-1.5 block text-sm font-medium text-ink">
          {t('age')}
          <span className="ms-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            {t('optional')}
          </span>
        </label>
        <input
          id="age"
          type="number"
          inputMode="numeric"
          dir="ltr"
          min={AGE_MIN}
          max={AGE_MAX}
          value={values.age}
          onChange={(e) => onChange('age', e.target.value)}
          aria-invalid={errors.has('age')}
          aria-describedby={errors.has('age') ? 'age-error' : undefined}
          className={`${INPUT} ${border(errors.has('age'))} tabular-nums`}
        />
        {errors.has('age') && (
          <p id="age-error" role="alert" className="mt-1 text-xs text-stay">
            {t('errorAge', { min: AGE_MIN, max: AGE_MAX })}
          </p>
        )}
      </div>

      {/* Nationality — ISO alpha-2, from the shared picker */}
      <CountrySelect
        value={values.nationality}
        onChange={(code) => onChange('nationality', code)}
        label={t('nationality')}
        optionalText={t('optional')}
        placeholder={t('nationalityPlaceholder')}
        searchPlaceholder={t('countrySearch')}
      />

      {/* City, and the district that only Istanbul has */}
      <CitySelect
        city={values.residenceCity}
        district={values.residenceDistrict}
        onCityChange={(v) => onChange('residenceCity', v)}
        onDistrictChange={(v) => onChange('residenceDistrict', v)}
        cityLabel={t('residenceCity')}
        cityPlaceholder={t('residenceCityPlaceholder')}
        districtLabel={t('residenceDistrict')}
        districtPlaceholder={t('residenceDistrictPlaceholder')}
        optionalText={t('optional')}
        searchPlaceholder={t('countrySearch')}
      />
    </div>
  );
}
