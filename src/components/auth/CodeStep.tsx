'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { AuthError } from '@supabase/supabase-js';

const LENGTH = 6;
const COOLDOWN_SECONDS = 60;

/**
 * 'ok' — the caller navigates; 'invalid' / 'error' — the standard messages;
 * { message } — the caller's own wording (attempts left, expired, locked…).
 */
export type VerifyResult = 'ok' | 'invalid' | 'error' | { message: string };

/** What a resend reports back: sent, or why not and for how long. */
export type ResendResult = boolean | { ok: boolean; message?: string; retryAfterSeconds?: number };

/**
 * A verifyOtp outcome → what the guest is told. A 4xx is the code's fault
 * (wrong, expired, already used: Supabase answers all three with 403
 * otp_expired); anything else is ours, and "wrong code" would be untrue.
 */
export function verifyResultFrom(error: AuthError | null, hasSession: boolean): VerifyResult {
  if (!error) return hasSession ? 'ok' : 'error';
  return error.status !== undefined && error.status >= 400 && error.status < 500 ? 'invalid' : 'error';
}

interface CodeStepProps {
  /** Checks the code. 'invalid' clears the boxes for another try. */
  onVerify: (code: string) => Promise<VerifyResult>;
  /** Sends a fresh code. False (or ok:false) keeps the resend link available. */
  onResend: () => Promise<ResendResult>;
  /**
   * Seconds before "Resend" is offered. Defaults to the full cooldown because
   * every caller but one arrives here having JUST sent a code — offering a
   * resend at second zero only invites a second SMS before the first lands.
   */
  initialCooldown?: number;
  /** "Change number" / "Change email" — back to the step that sent the code. */
  onBack?: () => void;
  backLabel?: string;
  submitLabel?: string;
}

/**
 * The 6-digit code entry shared by every verification on the site: phone
 * sign-in (sms), email confirmation (email), and the two contact changes
 * (email_change, phone_change). Only what is verified differs, so that is the
 * caller's; the boxes, paste, autofill and resend timing are the same
 * everywhere.
 *
 * autocomplete="one-time-code" on the first box lets iOS and Android offer the
 * code from the SMS; the whole code lands in that box and is spread across the
 * rest. A full code — typed, pasted or autofilled — submits by itself.
 */
export function CodeStep({
  onVerify,
  onResend,
  initialCooldown = COOLDOWN_SECONDS,
  onBack,
  backLabel,
  submitLabel,
}: CodeStepProps) {
  const t = useTranslations('auth.code');

  const [digits,   setDigits]   = useState<string[]>(Array(LENGTH).fill(''));
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [cooldown, setCooldown] = useState(initialCooldown);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Guards the auto-submit: a paste fires onChange and onPaste in some
  // browsers, and two verifyOtp calls for one code burn it on the second.
  const inFlight  = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  function focus(idx: number) {
    inputRefs.current[idx]?.focus();
  }

  async function submit(code: string) {
    if (inFlight.current) return;
    if (code.length !== LENGTH) {
      setError(t('error.incompleteCode'));
      return;
    }
    inFlight.current = true;
    setError('');
    setLoading(true);

    const result = await onVerify(code);

    inFlight.current = false;
    if (result === 'ok') return; // the caller navigates; loading stays on

    setLoading(false);
    setError(typeof result === 'object' ? result.message : t(result === 'invalid' ? 'error.invalidCode' : 'error.generic'));
    setDigits(Array(LENGTH).fill(''));
    focus(0);
  }

  function place(startIdx: number, chars: string) {
    const next = [...digits];
    let last = startIdx;
    for (let i = 0; i < chars.length && startIdx + i < LENGTH; i++) {
      next[startIdx + i] = chars[i];
      last = startIdx + i;
    }
    setDigits(next);
    const code = next.join('');
    if (code.length === LENGTH && !next.includes('')) {
      void submit(code);
    } else {
      focus(Math.min(last + 1, LENGTH - 1));
    }
  }

  function handleChange(idx: number, raw: string) {
    const chars = raw.replace(/\D/g, '');
    if (!chars) {
      const next = [...digits];
      next[idx] = '';
      setDigits(next);
      return;
    }
    place(idx, chars);
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = '';
        setDigits(next);
      } else if (idx > 0) {
        focus(idx - 1);
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      focus(idx - 1);
    } else if (e.key === 'ArrowRight' && idx < LENGTH - 1) {
      e.preventDefault();
      focus(idx + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, startIdx: number) {
    e.preventDefault();
    const chars = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH - startIdx);
    if (chars) place(startIdx, chars);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError('');
    const r = await onResend();
    const ok = typeof r === 'boolean' ? r : r.ok;
    if (ok) {
      setCooldown(COOLDOWN_SECONDS);
      return;
    }
    if (typeof r === 'object' && r.retryAfterSeconds) setCooldown(r.retryAfterSeconds);
    setError(typeof r === 'object' && r.message ? r.message : t('error.resendFailed'));
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(digits.join('')); }}
      noValidate
      className="flex flex-col gap-6"
    >
      {error && (
        <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {error}
        </div>
      )}

      {/* Digits read left to right in every locale, Arabic included */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">{t('label')}</span>
        <div dir="ltr" className="flex gap-1.5 sm:gap-2 justify-center">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={LENGTH}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={(e) => handlePaste(e, i)}
              onFocus={(e) => e.target.select()}
              aria-label={t('digit', { n: i + 1 })}
              disabled={loading}
              className="flex-1 min-w-0 max-w-12 h-14 border border-rule rounded-[8px] text-center text-xl font-semibold text-ink bg-paper focus:outline-none focus:border-ink transition-colors duration-[240ms] caret-transparent disabled:opacity-60"
            />
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-11 rounded-[999px] bg-stay text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-50"
      >
        {loading ? t('loading') : (submitLabel ?? t('submit'))}
      </button>

      <div className="flex items-center justify-center gap-4 text-sm">
        {cooldown > 0 ? (
          <span className="text-mute tabular-nums">{t('resendIn', { seconds: cooldown })}</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            className="min-h-11 text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
          >
            {t('resend')}
          </button>
        )}
        {onBack && backLabel && (
          <>
            <span className="text-rule" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onBack}
              className="min-h-11 text-mute hover:text-ink transition-colors duration-[240ms]"
            >
              {backLabel}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
