'use client';

import { Minus, Plus } from 'lucide-react';
import { MAX_GUESTS } from '@/lib/stays/filters';

// ── Shared guests stepper — used in BookingCard and SearchBar ────────────────
// Props carry explicit label strings so the component is namespace-agnostic.

interface GuestsStepperProps {
  value: number;
  onChange: (value: number) => void;
  decrementLabel: string;
  incrementLabel: string;
  inputLabel: string;
}

export function GuestsStepper({
  value,
  onChange,
  decrementLabel,
  incrementLabel,
  inputLabel,
}: GuestsStepperProps) {
  function dec() { onChange(Math.max(1, value - 1)); }
  function inc() { onChange(Math.min(MAX_GUESTS, value + 1)); }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseInt(e.target.value, 10);
    if (!isNaN(raw)) onChange(Math.min(MAX_GUESTS, Math.max(1, raw)));
  }
  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = parseInt(e.target.value, 10);
    onChange(isNaN(raw) || raw < 1 ? 1 : raw > MAX_GUESTS ? MAX_GUESTS : raw);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={dec}
        disabled={value <= 1}
        aria-label={decrementLabel}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-rule text-ink-soft transition-colors duration-[240ms] hover:bg-paper-warm disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      <input
        type="number"
        min={1}
        max={MAX_GUESTS}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-label={inputLabel}
        className="w-10 text-center text-sm text-ink font-semibold bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={inc}
        disabled={value >= MAX_GUESTS}
        aria-label={incrementLabel}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-rule text-ink-soft transition-colors duration-[240ms] hover:bg-paper-warm disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
