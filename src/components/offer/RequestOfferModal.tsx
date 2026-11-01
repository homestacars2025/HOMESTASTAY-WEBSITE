'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { X, CheckCircle } from 'lucide-react';
import { modalBackdrop, modalCard } from '@/lib/motion';
import { GuestsStepper } from '@/components/shared/GuestsStepper';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { Turnstile } from '@/components/security/Turnstile';
import { TURNSTILE_ACTION_OFFER } from '@/lib/security/turnstile-action';
import { toISODate } from '@/lib/stays/search-params';
import type { DateRange } from '@/components/home/DateRangePicker';
import { requestOffer, type OfferError } from '@/app/[locale]/stays/[slug]/offer-actions';

const DateRangePicker = dynamic(
  () => import('@/components/home/DateRangePicker').then((m) => ({ default: m.DateRangePicker })),
  { ssr: false },
);

function formatDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export interface RequestOfferModalProps {
  unitId: string;
  unitTitle: string;
  /** Turnstile site key — the form cannot be sent without the human check. */
  siteKey: string;
  initialRange?: DateRange;
  initialAdults?: number;
  onClose: () => void;
}

type Sent = { status: 'created' | 'duplicate'; reference: string; whatsappNumber: string };

/**
 * "Request an offer" for a price-on-request unit: a tiny form, then a success
 * screen whose one big action is sending the prefilled WhatsApp message.
 *
 * The message MUST carry the reference — the system links the guest's chat to
 * the request by it. Sending it ourselves would need a template; a message the
 * GUEST sends opens the 24-hour window at once and costs nothing.
 */
export function RequestOfferModal({ unitId, unitTitle, siteKey, initialRange, initialAdults, onClose }: RequestOfferModalProps) {
  const t = useTranslations('offer');
  const locale = useLocale();

  const [range, setRange] = useState<DateRange>(initialRange ?? { from: undefined });
  const [adults, setAdults] = useState(initialAdults && initialAdults > 0 ? initialAdults : 2);
  const [children, setChildren] = useState(0);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [pending, startTransition] = useTransition();

  // Escape closes; the page behind does not scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!range.from || !range.to) { setError(t('missingDates')); return; }
    if (!phone) { setError(t('missingPhone')); return; }
    const checkIn = toISODate(range.from);
    const checkOut = toISODate(range.to);
    startTransition(async () => {
      const result = await requestOffer({
        unitId, checkIn, checkOut, adults, children, phone, email, locale, captchaToken: token,
      }).catch(() => ({ ok: false as const, error: 'unavailable' as OfferError }));
      if (result.ok) {
        setSent({ status: result.status, reference: result.reference, whatsappNumber: result.whatsappNumber });
        return;
      }
      setError(t(`errors.${result.error}`));
      // A Turnstile token is single-use: get a fresh one for the next try.
      setToken(null);
      setResetSignal((n) => n + 1);
    });
  }

  const guests = t('guestsSummary', { adults, children });
  const waText = sent && range.from && range.to
    ? t('whatsappText', {
        title: unitTitle,
        checkIn: formatDate(range.from, locale),
        checkOut: formatDate(range.to, locale),
        guests,
        reference: sent.reference,
      })
    : '';
  const waHref = sent ? `https://wa.me/${sent.whatsappNumber}?text=${encodeURIComponent(waText)}` : '#';

  const label = 'font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-3 block';

  const content = (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-modal-title"
        className="fixed inset-0 z-[300] flex items-end md:items-center justify-center"
        variants={modalBackdrop}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />

        <motion.div
          variants={modalCard}
          className="relative z-10 w-full md:max-w-[540px] bg-white rounded-t-[20px] md:rounded-[14px] border border-rule shadow-[0_8px_40px_rgba(0,0,0,0.18)] flex flex-col max-h-[94svh] md:max-h-[90vh] overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-rule shrink-0">
            <h2 id="offer-modal-title" className="text-base font-medium tracking-[-0.025em] text-ink">
              {sent ? t('successTitle') : t('modalTitle')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="w-11 h-11 -me-2 flex items-center justify-center rounded-full text-mute hover:text-ink hover:bg-paper-warm transition-colors duration-[240ms]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {sent ? (
            <div className="px-5 py-8 flex flex-col items-center text-center gap-4">
              <CheckCircle className="w-10 h-10 text-stay" aria-hidden="true" />
              <p className="text-sm text-ink-soft leading-relaxed">
                {t('successBody', { reference: sent.reference })}
                {sent.status === 'duplicate' && <span className="block mt-1 text-mute">{t('duplicateNote')}</span>}
              </p>
              <p className="font-mono text-lg tracking-[0.08em] text-ink" dir="ltr">{sent.reference}</p>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-12 inline-flex items-center justify-center rounded-[999px] bg-stay text-white text-base font-semibold px-6 py-3 transition-opacity duration-[240ms] hover:opacity-90"
              >
                {t('whatsappButton')}
              </a>
              <p className="text-xs text-mute leading-relaxed">{t('successSecondary')}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6" noValidate>
              <p className="text-sm text-ink-soft leading-relaxed">{t('intro')}</p>

              <div>
                <span className={label}>{t('dates')}</span>
                <DateRangePicker selected={range} onSelect={setRange} locale={locale} />
              </div>

              <div className="border-t border-rule pt-5 grid grid-cols-2 gap-4">
                <div>
                  <span className={label}>{t('adults')}</span>
                  <GuestsStepper value={adults} onChange={setAdults} decrementLabel={t('decrement')} incrementLabel={t('increment')} inputLabel={t('adults')} />
                </div>
                <div>
                  <span className={label}>{t('children')} <span className="normal-case tracking-normal">· {t('childrenHint')}</span></span>
                  <GuestsStepper value={children} onChange={setChildren} min={0} decrementLabel={t('decrement')} incrementLabel={t('increment')} inputLabel={t('children')} />
                </div>
              </div>

              <div className="border-t border-rule pt-5 flex flex-col gap-4">
                <PhoneInput
                  value={phone}
                  onChange={(v) => { setPhone(v); setError(null); }}
                  defaultCountry="TR"
                  label={t('phoneLabel')}
                  searchPlaceholder={t('searchCountry')}
                />
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">{t('emailLabel')}</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder={t('emailPlaceholder')}
                    className="h-12 rounded-[14px] border border-rule px-4 text-base text-ink bg-white outline-none focus:border-ink transition-colors duration-[240ms] text-start"
                  />
                </label>
              </div>

              <Turnstile siteKey={siteKey} action={TURNSTILE_ACTION_OFFER} onToken={setToken} resetSignal={resetSignal} />

              {error && (
                <p role="alert" className="text-sm text-stay leading-relaxed">{error}</p>
              )}

              <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full min-h-12 rounded-[999px] bg-stay text-white text-sm font-semibold py-3 transition-opacity duration-[240ms] hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? t('sending') : t('submit')}
                </button>
                <p className="text-xs text-mute text-center leading-relaxed">{t('consent')}</p>
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return typeof document === 'undefined' ? null : createPortal(content, document.body);
}
