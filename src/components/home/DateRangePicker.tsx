'use client';

import { useState, useEffect } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import { ar, tr, ru, enUS } from 'date-fns/locale';

// ── Types ──────────────────────────────────────────────────────────────────────

export type { DateRange };

type Props = {
  selected: DateRange;
  onSelect: (range: DateRange) => void;
  locale: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const DFN_LOCALE: Record<string, typeof enUS> = { en: enUS, ar, tr, ru };

function useIsDesktop() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setOk(mq.matches);
    const h = (e: MediaQueryListEvent) => setOk(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return ok;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DateRangePicker({ selected, onSelect, locale }: Props) {
  const isDesktop = useIsDesktop();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dfnLocale = DFN_LOCALE[locale] ?? enUS;
  const isRtl = locale === 'ar';

  // Swap from/to if user somehow selects from > to (shouldn't happen but guard it)
  function handleSelect(range: DateRange | undefined) {
    onSelect(range ?? { from: undefined });
  }

  return (
    <>
      {/* Brand overrides for rdp CSS variables — scoped to this container */}
      <style>{`
        .hs-rdp-root {
          --rdp-accent-color: #E52851;
          --rdp-accent-background-color: rgba(229, 40, 81, 0.10);
          --rdp-today-color: #E52851;
          --rdp-day-height: 38px;
          --rdp-day-width: 38px;
          --rdp-day_button-height: 36px;
          --rdp-day_button-width: 36px;
          --rdp-day_button-border-radius: 999px;
          --rdp-disabled-opacity: 0.30;
          --rdp-outside-opacity: 0.35;
          --rdp-nav_button-height: 2rem;
          --rdp-nav_button-width: 2rem;
          --rdp-months-gap: 2rem;
          --rdp-range_start-color: white;
          --rdp-range_end-color: white;
          --rdp-range_start-date-background-color: #E52851;
          --rdp-range_end-date-background-color: #E52851;
          --rdp-range_middle-background-color: rgba(229, 40, 81, 0.10);
          --rdp-range_middle-color: #0E0E10;
          font-family: inherit;
          font-size: 13px;
        }
        .hs-rdp-root .rdp-month_caption {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: #0E0E10;
        }
        .hs-rdp-root .rdp-weekday {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #8C8881;
          opacity: 1;
        }
        .hs-rdp-root .rdp-day_button {
          font-size: 13px;
          color: #0E0E10;
          transition: background-color 160ms, color 160ms;
        }
        .hs-rdp-root .rdp-nav button {
          color: #8C8881;
          border: none;
          background: transparent;
          border-radius: 999px;
          transition: background-color 160ms;
        }
        .hs-rdp-root .rdp-nav button:hover {
          background-color: #F2EEE6;
          color: #0E0E10;
        }
        .hs-rdp-root .rdp-day_button:hover:not(:disabled) {
          background-color: #F2EEE6;
        }
        .hs-rdp-root .rdp-today:not(.rdp-range_start):not(.rdp-range_end) .rdp-day_button {
          font-weight: 600;
          color: #E52851;
        }
      `}</style>

      <DayPicker
        className="hs-rdp-root"
        mode="range"
        selected={selected}
        onSelect={handleSelect}
        disabled={{ before: today }}
        numberOfMonths={isDesktop ? 2 : 1}
        locale={dfnLocale}
        dir={isRtl ? 'rtl' : 'ltr'}
        showOutsideDays={false}
        weekStartsOn={isRtl ? 6 : 1}
      />
    </>
  );
}
