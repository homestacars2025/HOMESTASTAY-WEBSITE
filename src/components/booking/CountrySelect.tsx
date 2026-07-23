'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { getCountries } from 'react-phone-number-input';
import { ChevronDown, Search, Check } from 'lucide-react';
import enLabels from 'react-phone-number-input/locale/en.json';
import trLabels from 'react-phone-number-input/locale/tr.json';
import arLabels from 'react-phone-number-input/locale/ar.json';
import ruLabels from 'react-phone-number-input/locale/ru.json';

/**
 * Nationality picker.
 *
 * Country list + localized names come from react-phone-number-input (the same
 * source as PhoneInput's calling codes), NOT the 30-row `countries` table:
 * the library gives ~250 countries with tr/ar/ru/en names for free, and the
 * table stays for one job only — country_name_tr() in the WhatsApp webhook,
 * which Postgres needs because it cannot reach this library.
 *
 * Emits and stores the ISO alpha-2 code. The RPC stores it verbatim, so no DB
 * change is needed; mixed legacy values are normalised by country_name_tr().
 */

function toFlagEmoji(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
}

const LABEL_SETS: Record<string, Record<string, string>> = {
  en: enLabels as Record<string, string>,
  tr: trLabels as Record<string, string>,
  ar: arLabels as Record<string, string>,
  ru: ruLabels as Record<string, string>,
};

const CODES = getCountries();

interface CountrySelectProps {
  /** ISO alpha-2 code, or '' when unset. */
  value: string;
  onChange: (code: string) => void;
  label: string;
  optionalText?: string;
  placeholder: string;
  searchPlaceholder: string;
}

export function CountrySelect({
  value,
  onChange,
  label,
  optionalText,
  placeholder,
  searchPlaceholder,
}: CountrySelectProps) {
  const locale = useLocale();

  // Localized, name-sorted list — rebuilt only when the locale changes.
  const countries = useMemo(() => {
    const labels = LABEL_SETS[locale] ?? LABEL_SETS.en;
    return CODES
      .map((code) => ({
        code,
        name: labels[code] || LABEL_SETS.en[code] || code,
        flag: toFlagEmoji(code),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  const selected = countries.find((c) => c.code === value) ?? null;

  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('mousedown', handler);
    const id = setTimeout(() => searchRef.current?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', handler);
      clearTimeout(id);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setSearch('');
  }

  function pick(code: string) {
    onChange(code);
    close();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return countries;
    const q = search.toLowerCase();
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q,
    );
  }, [search, countries]);

  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-2">
        {label}
        {optionalText ? <span className="normal-case"> {optionalText}</span> : null}
      </label>

      <div ref={containerRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center gap-2 rounded-[14px] border bg-paper px-4 py-3 text-[15px] text-start transition-colors duration-[240ms] focus:outline-none focus:border-ink ${
            open ? 'border-ink' : 'border-rule'
          }`}
        >
          {selected ? (
            <>
              <span className="text-[18px] leading-none shrink-0 select-none" aria-hidden="true">
                {selected.flag}
              </span>
              <span className="flex-1 truncate text-ink">{selected.name}</span>
            </>
          ) : (
            <span className="flex-1 truncate text-mute">{placeholder}</span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-mute shrink-0 transition-transform duration-[240ms] ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={label}
            className="absolute top-full start-0 end-0 mt-1 bg-white border border-rule rounded-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 overflow-hidden"
          >
            <div className="p-2 border-b border-rule">
              <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-paper-warm">
                <Search className="w-3.5 h-3.5 text-mute shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="flex-1 bg-transparent text-sm text-ink placeholder:text-mute focus:outline-none min-w-0"
                />
              </div>
            </div>

            <div className="max-h-[240px] overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="px-4 py-4 text-sm text-mute text-center">—</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={c.code === value}
                    onClick={() => pick(c.code)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-start transition-colors duration-[240ms] hover:bg-paper-warm ${
                      c.code === value ? 'bg-paper-warm text-ink font-medium' : 'text-ink-soft'
                    }`}
                  >
                    <span className="text-[16px] leading-none shrink-0 select-none" aria-hidden="true">
                      {c.flag}
                    </span>
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.code === value && <Check className="w-3.5 h-3.5 text-stay shrink-0" />}
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
