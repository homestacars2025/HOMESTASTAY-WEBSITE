'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { ChevronDown, Search, Check } from 'lucide-react';
import {
  districtsFor,
  geoLabel,
  TURKEY_PROVINCES,
  type AppLocale,
  type GeoOption,
} from '@/lib/careers/turkey';

/**
 * City of residence, and — only for Istanbul — the district.
 *
 * Deliberately the same interaction as CountrySelect (search box, listbox,
 * outside-click close, 14px radius, 240ms): an applicant meets three pickers
 * on this form and all three should behave identically. It is not shared code
 * because CountrySelect is built around ISO codes and flag emoji, and forcing
 * one component to serve both would mean a flag slot that is always empty.
 *
 * ⚠️ WHAT IS STORED IS THE LATIN `value`, NEVER THE LABEL. The list shows
 * "إسطنبول" to an Arabic applicant and "İstanbul" to a Turkish one; both send
 * "Istanbul". That is what makes the district gate work in every locale and
 * keeps one spelling in the database.
 *
 * ⚠️ THE DISTRICT IS CLEARED BY THE PARENT, not here — ApplicationForm's
 * setFixedValue resets it on every city change, so an Istanbul district can
 * never be submitted against Ankara. This component only stops RENDERING it.
 */

interface CitySelectProps {
  city: string;
  district: string;
  onCityChange: (value: string) => void;
  onDistrictChange: (value: string) => void;
  cityLabel: string;
  cityPlaceholder: string;
  districtLabel: string;
  districtPlaceholder: string;
  optionalText: string;
  searchPlaceholder: string;
}

export function CitySelect({
  city,
  district,
  onCityChange,
  onDistrictChange,
  cityLabel,
  cityPlaceholder,
  districtLabel,
  districtPlaceholder,
  optionalText,
  searchPlaceholder,
}: CitySelectProps) {
  const locale = useLocale() as AppLocale;

  // Sorted in the reader's own language and collation — "Şişli" lands where a
  // Turkish speaker expects it, and the Arabic list is not in Latin order.
  const provinces = useMemo(
    () => sortByLabel(TURKEY_PROVINCES, locale),
    [locale],
  );

  const districts = useMemo(
    () => sortByLabel(districtsFor(city), locale),
    [city, locale],
  );

  return (
    <>
      <GeoPicker
        options={provinces}
        value={city}
        onChange={onCityChange}
        locale={locale}
        label={cityLabel}
        optionalText={optionalText}
        placeholder={cityPlaceholder}
        searchPlaceholder={searchPlaceholder}
      />

      {/* districtsFor() returns [] for every city but Istanbul, so this is the
          gate — one source of truth, in the data file, not a string compare
          repeated in the UI. */}
      {districts.length > 0 && (
        <GeoPicker
          options={districts}
          value={district}
          onChange={onDistrictChange}
          locale={locale}
          label={districtLabel}
          optionalText={optionalText}
          placeholder={districtPlaceholder}
          searchPlaceholder={searchPlaceholder}
        />
      )}
    </>
  );
}

function sortByLabel(options: GeoOption[], locale: AppLocale): GeoOption[] {
  return [...options].sort((a, b) =>
    geoLabel(a, locale).localeCompare(geoLabel(b, locale), locale),
  );
}

// ── The picker ────────────────────────────────────────────────────────────────

interface GeoPickerProps {
  options: GeoOption[];
  value: string;
  onChange: (value: string) => void;
  locale: AppLocale;
  label: string;
  optionalText: string;
  placeholder: string;
  searchPlaceholder: string;
}

function GeoPicker({
  options, value, onChange, locale,
  label, optionalText, placeholder, searchPlaceholder,
}: GeoPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    function onKey(e: KeyboardEvent) {
      // Escape closes without choosing — the expected way out of a listbox,
      // and the only one a keyboard user has once the search box has focus.
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    const id = setTimeout(() => searchRef.current?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
      clearTimeout(id);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setSearch('');
  }

  function pick(next: string) {
    onChange(next);
    close();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    // Matched against BOTH the localized label and the Latin value: someone
    // typing "Basaksehir" on an Arabic keyboard layout, or "باشاك" on a
    // Turkish one, both find the row.
    return options.filter(
      (o) =>
        geoLabel(o, locale).toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        o.en.toLowerCase().includes(q),
    );
  }, [search, options, locale]);

  return (
    <div>
      <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.1em] text-mute">
        {label}
        <span className="normal-case"> {optionalText}</span>
      </label>

      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={
            'flex w-full items-center gap-2 rounded-[14px] border bg-paper px-4 py-3 text-start text-[15px] transition-colors duration-[240ms] focus:border-ink focus:outline-none ' +
            (open ? 'border-ink' : 'border-rule')
          }
        >
          <span className={`flex-1 truncate ${selected ? 'text-ink' : 'text-mute'}`}>
            {selected ? geoLabel(selected, locale) : placeholder}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-mute transition-transform duration-[240ms] ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={label}
            className="absolute start-0 end-0 top-full z-50 mt-1 overflow-hidden rounded-[14px] border border-rule bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
          >
            <div className="border-b border-rule p-2">
              <div className="flex items-center gap-2 rounded-[10px] bg-paper-warm px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-mute" aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-mute focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-[240px] overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="px-4 py-4 text-center text-sm text-mute">—</div>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => pick(option.value)}
                    className={
                      'flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition-colors duration-[240ms] hover:bg-paper-warm ' +
                      (option.value === value
                        ? 'bg-paper-warm font-medium text-ink'
                        : 'text-ink-soft')
                    }
                  >
                    <span className="flex-1 truncate">{geoLabel(option, locale)}</span>
                    {option.value === value && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-stay" aria-hidden />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
