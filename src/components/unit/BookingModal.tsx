'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { X, CheckCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { modalBackdrop, modalCard } from '@/lib/motion';
import { GuestsStepper } from '@/components/shared/GuestsStepper';
import { BrandMark } from '@/components/brand/BrandMark';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useAuthGate } from '@/contexts/AuthGateContext';
import type { UnitPricing } from '@/lib/types/unit';
import type { DateRange } from '@/components/home/DateRangePicker';

const DateRangePicker = dynamic(
  () => import('@/components/home/DateRangePicker').then((m) => ({ default: m.DateRangePicker })),
  { ssr: false }
);

// ── Booking intent ─────────────────────────────────────────────────────────────

export const INTENT_KEY = 'hs_booking_intent';

export interface BookingIntent {
  unitId:   string;
  dateFrom: string | null;
  dateTo:   string | null;
  guests:   number;
}

export function saveBookingIntent(intent: BookingIntent): void {
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch { /* non-fatal */ }
}

export function loadAndClearBookingIntent(unitId: string): BookingIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as BookingIntent;
    if (intent.unitId !== unitId) return null;
    sessionStorage.removeItem(INTENT_KEY);
    return intent;
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
  }).format(d);
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 'pick' | 'confirm';

// ── Props ──────────────────────────────────────────────────────────────────────

interface BookingModalProps {
  unitId:            string;
  unitTitle:         string;
  /** Live quote for the current date range. total_usd is the resolver's SUM
   *  across the nights — null until a complete range has been quoted. */
  pricing:           UnitPricing;
  minNights:         number;
  dateRange:         DateRange;
  guests:            number;
  onDateRangeChange: (r: DateRange) => void;
  onGuestsChange:    (n: number) => void;
  initialStep?:      Step;
  onClose:           () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BookingModal({
  unitId,
  unitTitle,
  pricing,
  minNights,
  dateRange,
  guests,
  onDateRangeChange,
  onGuestsChange,
  initialStep = 'pick',
  onClose,
}: BookingModalProps) {
  const t      = useTranslations('unit');
  const locale = useLocale();
  const user   = useAuthUser();
  const { openAuthGate } = useAuthGate();

  const [step, setStep] = useState<Step>(initialStep);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const nightsCount = dateRange.from && dateRange.to
    ? Math.round((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const isBelowMin = nightsCount !== null && nightsCount < minNights;
  const canContinue = !!dateRange.from;

  // ── Continue handler ─────────────────────────────────────────────────────────

  const handleContinue = useCallback(() => {
    if (!canContinue) return;

    if (user === undefined) return; // still loading

    if (!user) {
      // Not logged in: save intent and open auth gate
      saveBookingIntent({
        unitId,
        dateFrom: dateRange.from ? dateRange.from.toISOString() : null,
        dateTo:   dateRange.to   ? dateRange.to.toISOString()   : null,
        guests,
      });
      onClose();
      openAuthGate({ type: 'reserve', unitId });
      return;
    }

    setStep('confirm');
  }, [canContinue, user, unitId, dateRange, guests, onClose, openAuthGate]);

  // ── Summary strings ──────────────────────────────────────────────────────────

  const checkInLabel  = dateRange.from ? formatDate(dateRange.from, locale) : null;
  const checkOutLabel = dateRange.to   ? formatDate(dateRange.to,   locale) : null;

  // ── Modal content ────────────────────────────────────────────────────────────

  const content = (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        className="fixed inset-0 z-[300] flex items-end md:items-center justify-center"
        variants={modalBackdrop}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          aria-hidden="true"
          onClick={onClose}
        />

        {/* Card */}
        <motion.div
          variants={modalCard}
          className="relative z-10 w-full md:max-w-[540px] bg-white rounded-t-[20px] md:rounded-[14px] border border-rule shadow-[0_8px_40px_rgba(0,0,0,0.18)] flex flex-col max-h-[94svh] md:max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-rule shrink-0">
            <h2
              id="booking-modal-title"
              className="text-base font-medium tracking-[-0.025em] text-ink"
            >
              {step === 'pick' ? t('booking.modalTitle') : t('booking.confirmTitle')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full text-mute hover:text-ink hover:bg-paper-warm transition-colors duration-[240ms]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {step === 'pick' ? (
              <div className="px-5 py-5 flex flex-col gap-6">

                {/* Calendar */}
                <div>
                  <DateRangePicker
                    selected={dateRange}
                    onSelect={onDateRangeChange}
                    locale={locale}
                  />
                  {isBelowMin && (
                    <p className="mt-2 text-xs text-stay ps-1">
                      {minNights} {minNights === 1 ? t('specs.nightMin') : t('specs.nightsMin')}
                    </p>
                  )}
                </div>

                {/* Guests */}
                <div className="border-t border-rule pt-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-4">
                    {t('guestsLabel')}
                  </p>
                  <GuestsStepper
                    value={guests}
                    onChange={onGuestsChange}
                    decrementLabel={t('guestsDecrement')}
                    incrementLabel={t('guestsIncrement')}
                    inputLabel={t('guestsLabel')}
                  />
                </div>
              </div>
            ) : (
              /* Confirm step */
              <div className="px-5 py-6 flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-stay/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-stay" />
                </div>
                <div>
                  <h3 className="text-[1.1rem] font-medium tracking-[-0.025em] text-ink mb-1">
                    {t('booking.confirmTitle')}
                  </h3>
                  <p className="text-xs text-mute mb-2 truncate">{unitTitle}</p>
                  <p className="text-sm text-mute leading-relaxed max-w-xs">
                    {t('booking.confirmBody')}
                  </p>
                </div>

                {/* Summary */}
                <div className="w-full border border-rule rounded-[10px] text-sm text-start mt-2">
                  <div className="grid grid-cols-2">
                    <div className="p-3 border-e border-rule">
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-1">
                        {t('checkIn')}
                      </p>
                      <p className="text-ink">{checkInLabel ?? '—'}</p>
                    </div>
                    <div className="p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-1">
                        {t('checkOut')}
                      </p>
                      <p className="text-ink">{checkOutLabel ?? '—'}</p>
                    </div>
                  </div>
                  <div className="p-3 border-t border-rule flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-1">
                        {t('guestsLabel')}
                      </p>
                      <p className="text-ink">
                        {t('guestCount', { count: guests })}
                      </p>
                    </div>
                    {nightsCount !== null && (
                      <div className="text-end">
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-1">
                          {t('booking.nights', { count: nightsCount })}
                        </p>
                        {/* The stay total is the resolver's SUM over the
                            nights. Never nightly x nights: that would ignore
                            seasonal daily prices and length-of-stay discounts. */}
                        {pricing.total_usd !== null && (
                          <p className="text-stay font-semibold">
                            ${pricing.total_usd}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1 text-xs text-mute mt-1">
                  <BrandMark className="w-[10px] h-[10px]" />
                  <span>Homesta Stay</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer CTA */}
          <div className="px-5 py-4 border-t border-rule shrink-0">
            {step === 'pick' ? (
              <>
                {!canContinue && (
                  <p className="text-xs text-mute mb-3 text-center">
                    {t('booking.selectDatesHint')}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue || isBelowMin === true}
                  className="w-full bg-stay text-white rounded-[999px] py-3 text-sm font-semibold transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('booking.continue')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-ink text-white rounded-[999px] py-3 text-sm font-semibold transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70"
              >
                {t('booking.done')}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
