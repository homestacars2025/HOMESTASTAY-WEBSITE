'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ChevronDown, CheckCircle } from 'lucide-react';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { CategoryIcon } from '@/components/home/CategoryIcon';
import { submitHostApplication } from '@/app/[locale]/host/actions';

// ── Types ──────────────────────────────────────────────────────────────────────

type FormCity = {
  id: string;
  name: string;           // English DB name — used when saving
  localizedName: string;  // display name for current locale
  hasDistricts: boolean;
};

type FormDistrict = {
  id: string;
  name: string;
  cityId: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const UNIT_TYPES = ['apartment', 'villa', 'cabin', 'hotel', 'farm'] as const;
const CONTACT_METHODS = ['whatsapp', 'phone', 'email'] as const;

// Maps form unit type slug → CategoryIcon name prop
const ICON_MAP: Record<string, string> = {
  apartment: 'apartments',
  villa:     'villas',
  cabin:     'cabins',
  hotel:     'hotels',
  farm:      'farms',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children, required }: { htmlFor?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
      {children}
      {required && <span className="text-stay ms-0.5" aria-hidden="true"> *</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-stay mt-0.5">{message}</p>;
}

function UnitTypeSelect({
  value,
  onChange,
  label,
  placeholder,
  unitLabels,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  unitLabels: Record<string, string>;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel required>{label}</FieldLabel>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center justify-between gap-2 border rounded-[8px] px-3 py-2.5 text-sm bg-paper transition-colors duration-[240ms] ${
            open ? 'border-ink' : error ? 'border-stay' : 'border-rule'
          } ${value ? 'text-ink' : 'text-mute'}`}
        >
          <span className="flex items-center gap-2 min-w-0">
            {value && (
              <CategoryIcon name={ICON_MAP[value] ?? 'apartments'} size={18} />
            )}
            <span className="truncate">{value ? unitLabels[value] : placeholder}</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-mute shrink-0 transition-transform duration-[240ms] ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute top-full start-0 end-0 mt-1 bg-white border border-rule rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 overflow-hidden"
          >
            {UNIT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="option"
                aria-selected={value === type}
                onClick={() => { onChange(type); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-start transition-colors duration-[240ms] hover:bg-paper-warm ${
                  value === type ? 'bg-paper-warm text-ink font-medium' : 'text-ink-soft'
                }`}
              >
                <CategoryIcon name={ICON_MAP[type]} size={18} />
                <span>{unitLabels[type]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <FieldError message={error} />
    </div>
  );
}

// ── SimpleSelect — text-only dropdown for city and district ───────────────────

function SimpleSelect({
  value,
  onChange,
  label,
  placeholder,
  options,
  error,
  required,
  scrollable,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
  required?: boolean;
  scrollable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center justify-between gap-2 border rounded-[8px] px-3 py-2.5 text-sm bg-paper transition-colors duration-[240ms] ${
            open ? 'border-ink' : error ? 'border-stay' : 'border-rule'
          } ${value ? 'text-ink' : 'text-mute'}`}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown
            className={`w-4 h-4 text-mute shrink-0 transition-transform duration-[240ms] ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div
            role="listbox"
            className={`absolute top-full start-0 end-0 mt-1 bg-white border border-rule rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 overflow-hidden ${
              scrollable ? 'max-h-[288px] overflow-y-auto' : ''
            }`}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center px-4 py-2.5 text-sm text-start transition-colors duration-[240ms] hover:bg-paper-warm ${
                  value === opt.value ? 'bg-paper-warm text-ink font-medium' : 'text-ink-soft'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <FieldError message={error} />
    </div>
  );
}

function ContactMethodPicker({
  value,
  onChange,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  labels: { whatsapp: string; phone: string; email: string };
}) {
  return (
    <div className="flex rounded-[8px] border border-rule overflow-hidden">
      {CONTACT_METHODS.map((method, i) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange(method)}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors duration-[240ms] ${
            i > 0 ? 'border-s border-rule' : ''
          } ${
            value === method
              ? 'bg-ink text-white'
              : 'bg-paper text-mute hover:bg-paper-warm hover:text-ink-soft'
          }`}
        >
          {labels[method]}
        </button>
      ))}
    </div>
  );
}

// ── Input class helper ─────────────────────────────────────────────────────────

const INPUT_BASE =
  'w-full border rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none transition-colors duration-[240ms]';
const inputCls = (hasError?: boolean) =>
  `${INPUT_BASE} ${hasError ? 'border-stay focus:border-stay' : 'border-rule focus:border-ink'}`;

// ── Main form ──────────────────────────────────────────────────────────────────

export function HostForm({
  cities,
  districtsByCityId,
}: {
  cities: FormCity[];
  districtsByCityId: Record<string, FormDistrict[]>;
}) {
  const t      = useTranslations('pages.host');
  const locale = useLocale();

  // ── Field state
  const [name,           setName]           = useState('');
  const [phone,          setPhone]          = useState('');
  const [email,          setEmail]          = useState('');
  const [unitType,       setUnitType]       = useState('');
  const [unitsCount,     setUnitsCount]     = useState('');
  const [cityId,         setCityId]         = useState('');
  const [districtId,     setDistrictId]     = useState('');
  const [districtManual, setDistrictManual] = useState('');
  const [contactMethod,  setContactMethod]  = useState('whatsapp');
  const [note,           setNote]           = useState('');
  const [listingLink,    setListingLink]    = useState('');

  // ── UI state
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [loading,      setLoading]      = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [submittedName, setSubmittedName] = useState('');

  // ── Derived geo state
  const selectedCity    = cities.find((c) => c.id === cityId) ?? null;
  const cityDistricts   = cityId ? (districtsByCityId[cityId] ?? []) : [];
  const hasDistrictDrop = !!selectedCity?.hasDistricts;
  // Show the manual text input when: city has no districts, OR user picked "Other"
  const showManualDist  = !!selectedCity && (!hasDistrictDrop || districtId === 'other');

  function handleCityChange(id: string) {
    setCityId(id);
    setDistrictId('');
    setDistrictManual('');
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!name.trim())    errs.name      = t('error.required');
    if (!phone)          errs.phone     = t('error.required');
    else if (!isValidPhoneNumber(phone)) errs.phone = t('error.phoneInvalid');
    if (!email.trim())   errs.email     = t('error.required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = t('error.emailInvalid');
    if (!unitType)       errs.unitType  = t('error.required');
    const count = parseInt(unitsCount, 10);
    if (!unitsCount || isNaN(count) || count < 1) errs.unitsCount = t('error.unitsMin');
    if (!cityId)         errs.city      = t('error.required');
    return errs;
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setErrors({});
    setSubmitError('');
    setLoading(true);

    // Resolve final district string: dropdown selection, or manual text, or empty
    const districtName = districtId === 'other'
      ? districtManual.trim()
      : districtId
        ? (cityDistricts.find((d) => d.id === districtId)?.name ?? '')
        : districtManual.trim();

    const result = await submitHostApplication({
      name:          name.trim(),
      phone,
      email:         email.trim(),
      unitType,
      unitsCount:    parseInt(unitsCount, 10),
      city:          selectedCity?.name ?? '',
      district:      districtName,
      contactMethod,
      note:          note.trim(),
      listingLink:   listingLink.trim(),
    });

    if (result.ok) {
      setSubmittedName(result.name);
      setSubmitted(true);
    } else {
      setSubmitError(t(`error.${result.error}`));
      setLoading(false);
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex flex-col items-center text-center gap-5 py-10">
        <CheckCircle size={48} strokeWidth={1.5} className="text-stay" />
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-medium tracking-[-0.025em] text-ink">
            {t('success.title')}
          </h2>
          <p className="text-sm text-mute leading-relaxed max-w-xs">
            {t('success.body', { name: submittedName })}
          </p>
        </div>
        <Link
          href={`/${locale}`}
          className="rounded-[999px] bg-ink text-white text-sm font-medium px-6 py-2.5 transition-opacity duration-[240ms] hover:opacity-80"
        >
          {t('success.back')}
        </Link>
      </div>
    );
  }

  // ── Unit type labels (localised)
  const unitLabels = {
    apartment: t('unitTypes.apartment'),
    villa:     t('unitTypes.villa'),
    cabin:     t('unitTypes.cabin'),
    hotel:     t('unitTypes.hotel'),
    farm:      t('unitTypes.farm'),
  };

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

      {/* Generic server error */}
      {submitError && (
        <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {submitError}
        </div>
      )}

      {/* Full name */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="host-name" required>{t('form.nameLabel')}</FieldLabel>
        <input
          id="host-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('form.namePlaceholder')}
          className={inputCls(!!errors.name)}
        />
        <FieldError message={errors.name} />
      </div>

      {/* Phone */}
      <div className="flex flex-col gap-1.5">
        <PhoneInput
          value={phone}
          onChange={setPhone}
          defaultCountry="TR"
          label={t('form.phoneLabel')}
          searchPlaceholder={t('form.phoneSearchPlaceholder')}
          errorId={errors.phone ? 'host-phone-err' : undefined}
        />
        {errors.phone && <p id="host-phone-err" className="text-xs text-stay mt-0.5">{errors.phone}</p>}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="host-email" required>{t('form.emailLabel')}</FieldLabel>
        <input
          id="host-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('form.emailPlaceholder')}
          className={inputCls(!!errors.email)}
        />
        <FieldError message={errors.email} />
      </div>

      {/* Unit type */}
      <UnitTypeSelect
        value={unitType}
        onChange={setUnitType}
        label={t('form.unitTypeLabel')}
        placeholder={t('form.unitTypePlaceholder')}
        unitLabels={unitLabels}
        error={errors.unitType}
      />

      {/* Units count + City — 2-col on wider screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="host-units" required>{t('form.unitsCountLabel')}</FieldLabel>
          <input
            id="host-units"
            type="number"
            inputMode="numeric"
            min={1}
            value={unitsCount}
            onChange={(e) => setUnitsCount(e.target.value)}
            placeholder={t('form.unitsCountPlaceholder')}
            className={inputCls(!!errors.unitsCount)}
          />
          <FieldError message={errors.unitsCount} />
        </div>

        <SimpleSelect
          value={cityId}
          onChange={handleCityChange}
          label={t('form.cityLabel')}
          placeholder={t('form.cityPlaceholder')}
          options={cities.map((c) => ({ value: c.id, label: c.localizedName }))}
          error={errors.city}
          required
        />
      </div>

      {/* District — shown after city is selected */}
      {selectedCity && (
        <>
          {/* Dropdown for cities with registered districts (Istanbul) */}
          {hasDistrictDrop && (
            <SimpleSelect
              value={districtId}
              onChange={setDistrictId}
              label={t('form.districtLabel')}
              placeholder={t('form.districtPlaceholder')}
              options={[
                ...cityDistricts.map((d) => ({ value: d.id, label: d.name })),
                { value: 'other', label: t('form.districtOther') },
              ]}
              scrollable
            />
          )}

          {/* Free-text input: cities without districts, or "Other" chosen */}
          {showManualDist && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="host-district">{t('form.districtLabel')}</FieldLabel>
              <input
                id="host-district"
                type="text"
                value={districtManual}
                onChange={(e) => setDistrictManual(e.target.value)}
                placeholder={t('form.districtManualPlaceholder')}
                className={`${INPUT_BASE} border-rule focus:border-ink`}
              />
            </div>
          )}
        </>
      )}

      {/* Preferred contact method */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel required>{t('form.contactMethodLabel')}</FieldLabel>
        <ContactMethodPicker
          value={contactMethod}
          onChange={setContactMethod}
          labels={{
            whatsapp: t('form.contactWhatsapp'),
            phone:    t('form.contactPhone'),
            email:    t('form.contactEmail'),
          }}
        />
      </div>

      {/* Note (optional) */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="host-note">{t('form.noteLabel')}</FieldLabel>
        <textarea
          id="host-note"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('form.notePlaceholder')}
          className={`${INPUT_BASE} border-rule focus:border-ink resize-none`}
        />
      </div>

      {/* Listing link (optional) */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="host-link">{t('form.listingLinkLabel')}</FieldLabel>
        <input
          id="host-link"
          type="url"
          autoComplete="url"
          value={listingLink}
          onChange={(e) => setListingLink(e.target.value)}
          placeholder={t('form.listingLinkPlaceholder')}
          className={`${INPUT_BASE} border-rule focus:border-ink`}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[999px] bg-stay text-white text-sm font-medium py-3.5 transition-opacity duration-[240ms] hover:opacity-85 active:opacity-75 disabled:opacity-50 mt-1"
      >
        {loading ? t('form.sending') : t('form.submit')}
      </button>
    </form>
  );
}
