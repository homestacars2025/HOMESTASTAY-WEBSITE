'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

const LOCALES: { code: Locale; label: string; native: string }[] = [
  { code: 'en', label: 'EN', native: 'English' },
  { code: 'ar', label: 'AR', native: 'العربية' },
  { code: 'tr', label: 'TR', native: 'Türkçe' },
  { code: 'ru', label: 'RU', native: 'Русский' },
];

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <div className="relative">
      {/* Invisible backdrop to close on outside click */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="relative z-50 flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] text-sm font-medium text-ink hover:bg-paper-warm transition-colors duration-[240ms]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {current.label}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-[240ms] ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full end-0 mt-1.5 z-50 min-w-[148px] rounded-[14px] border border-rule bg-white shadow-[0_8px_32px_rgba(0,0,0,0.10)] py-1.5 overflow-hidden"
        >
          {LOCALES.map(({ code, native }) => (
            <Link
              key={code}
              href={pathname}
              locale={code}
              role="option"
              aria-selected={locale === code}
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors duration-[240ms] ${
                locale === code
                  ? 'text-ink font-medium bg-paper-warm'
                  : 'text-ink-soft hover:bg-paper-warm hover:text-ink'
              }`}
            >
              {native}
              {locale === code && (
                <span className="w-1.5 h-1.5 rounded-full bg-stay" />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
