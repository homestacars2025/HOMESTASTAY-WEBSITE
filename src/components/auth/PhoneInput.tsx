'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { getCountries, getCountryCallingCode } from 'react-phone-number-input';
import type { CountryCode } from 'libphonenumber-js';
import { ChevronDown, Search } from 'lucide-react';

// Convert 2-letter ISO code → flag emoji (works in all modern browsers/OS)
function toFlagEmoji(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
}

// Import country labels — Next.js resolveJsonModule handles this
// reason: dynamic require avoids needing @types for the JSON locale file
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LABELS: Record<string, string> = require('react-phone-number-input/locale/en.json');

interface Country {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
}

// Build sorted list once at module level — all ~250 countries/territories
const ALL_COUNTRIES: Country[] = getCountries()
  .map((code) => ({
    code,
    name: LABELS[code] ?? code,
    dialCode: `+${getCountryCallingCode(code)}`,
    flag: toFlagEmoji(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

interface PhoneInputProps {
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: CountryCode;
  label: string;
  searchPlaceholder: string;
  errorId?: string;
}

export function PhoneInput({
  value: _value,
  onChange,
  defaultCountry = 'TR',
  label,
  searchPlaceholder,
  errorId,
}: PhoneInputProps) {
  const defaultC = ALL_COUNTRIES.find((c) => c.code === defaultCountry) ?? ALL_COUNTRIES[0];

  const [selected,       setSelected]       = useState<Country>(defaultC);
  const [localNumber,    setLocalNumber]    = useState('');
  const [dropdownOpen,   setDropdownOpen]   = useState(false);
  const [search,         setSearch]         = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);
  const numberRef    = useRef<HTMLInputElement>(null);

  // Sync E.164 to parent whenever country or local number changes
  function emit(country: Country, raw: string) {
    const digits = raw.replace(/\D/g, '');
    onChange(digits ? `${country.dialCode}${digits}` : '');
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handler);
    // Auto-focus search
    const id = setTimeout(() => searchRef.current?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', handler);
      clearTimeout(id);
    };
  }, [dropdownOpen]);

  function closeDropdown() {
    setDropdownOpen(false);
    setSearch('');
  }

  function selectCountry(c: Country) {
    setSelected(c);
    emit(c, localNumber);
    closeDropdown();
    numberRef.current?.focus();
  }

  function handleLocalChange(raw: string) {
    setLocalNumber(raw);
    emit(selected, raw);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_COUNTRIES;
    const q = search.toLowerCase();
    return ALL_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase() === q
    );
  }, [search]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="phone-number" className="text-sm font-medium text-ink">
        {label}
      </label>

      <div ref={containerRef} className="relative">
        {/* ── Input row ── */}
        <div
          className={`flex rounded-[8px] border transition-colors duration-[240ms] overflow-visible focus-within:border-ink ${
            dropdownOpen ? 'border-ink' : 'border-rule'
          }`}
        >
          {/* Country-code trigger */}
          <button
            type="button"
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
            aria-label={`${selected.name} ${selected.dialCode}`}
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 ps-3 pe-2.5 py-2.5 bg-paper-warm hover:bg-rule/40 border-e border-rule rounded-s-[8px] shrink-0 transition-colors duration-[240ms]"
          >
            <span className="text-[18px] leading-none select-none" aria-hidden="true">
              {selected.flag}
            </span>
            <span className="text-sm font-medium text-ink tabular-nums whitespace-nowrap">
              {selected.dialCode}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-mute shrink-0 transition-transform duration-[240ms] ${
                dropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* National number */}
          <input
            ref={numberRef}
            id="phone-number"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            value={localNumber}
            onChange={(e) => handleLocalChange(e.target.value)}
            aria-describedby={errorId}
            className="flex-1 px-3 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none rounded-e-[8px] min-w-0"
          />
        </div>

        {/* ── Dropdown ── */}
        {dropdownOpen && (
          <div
            role="listbox"
            aria-label="Select country"
            className="absolute top-full start-0 end-0 mt-1 bg-white border border-rule rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 overflow-hidden"
          >
            {/* Search bar */}
            <div className="p-2 border-b border-rule">
              <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-paper-warm">
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

            {/* Country list */}
            <div className="max-h-[220px] overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="px-4 py-4 text-sm text-mute text-center">—</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={c.code === selected.code}
                    onClick={() => selectCountry(c)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-start transition-colors duration-[240ms] hover:bg-paper-warm ${
                      c.code === selected.code
                        ? 'bg-paper-warm text-ink font-medium'
                        : 'text-ink-soft'
                    }`}
                  >
                    <span className="text-[16px] leading-none shrink-0 select-none" aria-hidden="true">
                      {c.flag}
                    </span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-mute tabular-nums text-xs shrink-0">{c.dialCode}</span>
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
