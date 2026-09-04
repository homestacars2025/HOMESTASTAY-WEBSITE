'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

/**
 * A single_choice question with too many options to lay flat.
 *
 * WHY THIS EXISTS RATHER THAN ALWAYS-RADIOS. Radio cards are the better
 * control for a short list — every option visible, one tap, no hidden state.
 * They are the worse one past a handful: 39 Istanbul districts as radio cards
 * is a wall the applicant has to scroll past to reach the next question, on a
 * 375px screen (Law 5). The switch is on COUNT, not on the question, so every
 * opening gets it without the console knowing anything about it.
 *
 * Deliberately the same interaction as the nationality picker — search box,
 * listbox, outside-click and Escape to close, 14px radius, 240ms. An applicant
 * meets both on one form and they should not behave differently.
 *
 * ⚠️ THE STORED VALUE IS THE OPTION STRING, VERBATIM. There is no code here,
 * no normalisation, no trim: whatever the console author typed in `options` is
 * exactly what goes into `answers`. That is what keeps the answer matching the
 * question as it was asked.
 */

interface ChoiceSelectProps {
  id: string;
  options: string[];
  /** The selected option, or '' when unanswered. */
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
  placeholder: string;
  searchPlaceholder: string;
  /** Names the listbox for screen readers — the question's own text. */
  label: string;
}

export function ChoiceSelect({
  id, options, value, onChange, invalid, describedBy,
  placeholder, searchPlaceholder, label,
}: ChoiceSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      // The only way out for a keyboard user once the search box has focus.
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 10);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setSearch('');
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [search, options]);

  return (
    <div ref={containerRef} className="relative">
      {/* role="combobox", not the implicit button role: a button does not
          support aria-invalid, and dropping it would leave a screen-reader
          user with a red border they cannot perceive. combobox is the ARIA
          pattern for exactly this trigger, and it takes aria-controls so the
          listbox below is announced as its popup. */}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        className={
          'flex min-h-[44px] w-full items-center gap-2 rounded-[14px] border bg-paper px-4 py-3 text-start text-[15px] transition-colors duration-[240ms] focus:border-ink focus:outline-none ' +
          (invalid ? 'border-stay' : open ? 'border-ink' : 'border-rule')
        }
      >
        <span className={`flex-1 truncate ${value ? 'text-ink' : 'text-mute'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-mute transition-transform duration-[240ms] ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={listboxId}
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
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={option === value}
                  onClick={() => {
                    onChange(option);
                    close();
                  }}
                  className={
                    'flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition-colors duration-[240ms] hover:bg-paper-warm ' +
                    (option === value ? 'bg-paper-warm font-medium text-ink' : 'text-ink-soft')
                  }
                >
                  <span className="flex-1 truncate">{option}</span>
                  {option === value && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-stay" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
