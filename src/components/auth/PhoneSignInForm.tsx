'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { Link, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncProfileFromAuth } from '@/lib/auth/sync-profile';
import { completeProfilePath, safeReturnPath } from '@/lib/auth/profile-gap';
import { continueUrl } from '@/lib/auth/continue-url';
import { requestPhoneCode, type PhoneCodeResult } from '@/lib/auth/phone-actions';
import { TURNSTILE_ACTION_PHONE } from '@/lib/security/turnstile-action';
import { Turnstile } from '@/components/security/Turnstile';
import { PhoneInput } from './PhoneInput';
import { CodeStep, verifyResultFrom, type ResendResult, type VerifyResult } from './CodeStep';

interface PhoneSignInFormProps {
  returnUrl?: string;
  /** Sign-up may create an account; sign-in asks first. */
  intent: 'sign-in' | 'sign-up';
  /** Cloudflare Turnstile site key — the page only renders this form with one. */
  siteKey: string;
}

type Notice =
  | { kind: 'new_account' }
  | { kind: 'email_account'; emailHint: string | null };

/**
 * Phone sign-in and sign-up — one form, two doors.
 *
 *   number + human check → requestPhoneCode (server: Turnstile, limits,
 *   phone_account_check, then the SMS) → 6-digit code → verifyOtp type 'sms'
 *
 * The SMS is never requested from the browser directly. What the server finds
 * decides the next screen: an existing phone account gets its code; a new
 * number on the SIGN-IN page is asked "create an account with this number?";
 * a number that belongs to an EMAIL account gets no SMS and is pointed to the
 * email tab. After the code, a new account finishes on /complete-profile
 * (name + verified email); everyone else leaves through /api/auth/continue,
 * which also routes hosts and staff.
 */
export function PhoneSignInForm({ returnUrl, intent, siteKey }: PhoneSignInFormProps) {
  const t      = useTranslations('auth.phone');
  const router = useRouter();
  const locale = useLocale();
  const back   = safeReturnPath(returnUrl);

  const [step,    setStep]    = useState<'phone' | 'code'>('phone');
  const [phone,   setPhone]   = useState('');
  const [error,   setError]   = useState('');
  const [notice,  setNotice]  = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [token,   setToken]   = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [createConfirmed, setCreateConfirmed] = useState(false);

  /** Turnstile tokens are single-use: ask for a fresh one after each send. */
  function spendToken(): string | null {
    const current = token;
    setResetSignal((n) => n + 1);
    return current;
  }

  function errorText(r: Extract<PhoneCodeResult, { ok: false }>): string {
    switch (r.error) {
      case 'invalid':          return t('error.phoneInvalid');
      case 'captcha':          return t('error.captcha');
      case 'rate_limited':
      case 'sms_rate_limited': return t('error.rateLimited');
      case 'send_failed':      return t('error.sendFailed');
      case 'unavailable':      return t('error.unavailable');
      default:                 return t('error.generic');
    }
  }

  async function send(createAccount: boolean): Promise<PhoneCodeResult> {
    return requestPhoneCode({ phone, intent, createAccount, captchaToken: spendToken() });
  }

  async function submit(createAccount = createConfirmed) {
    if (!phone || !isValidPhoneNumber(phone)) {
      setError(t('error.phoneInvalid'));
      return;
    }
    if (!token) {
      setError(t('error.captcha'));
      return;
    }
    setError('');
    setNotice(null);
    setLoading(true);
    const r = await send(createAccount);
    setLoading(false);

    if (r.ok) { setStep('code'); return; }
    if (r.error === 'new_account')   { setNotice({ kind: 'new_account' }); return; }
    if (r.error === 'email_account') { setNotice({ kind: 'email_account', emailHint: r.emailHint }); return; }
    setError(errorText(r));
  }

  async function verify(code: string): Promise<VerifyResult> {
    const { data, error: otpError } = await createClient().auth.verifyOtp({ phone, token: code, type: 'sms' });
    const outcome = verifyResultFrom(otpError, Boolean(data.session));
    if (outcome !== 'ok') return outcome;

    // Non-fatal: the session is valid either way. A failed sync shows up as
    // gaps, and /complete-profile works them out from the account itself.
    const gap = (await syncProfileFromAuth().catch(() => null))?.gap;
    if (!gap || gap.email || gap.name) {
      // A new account: name + verified email next. /complete-profile is for
      // guests only and sends hosts and staff on through /api/auth/continue.
      router.push(completeProfilePath(back));
      router.refresh();
    } else {
      window.location.assign(continueUrl(back || null, locale));
    }
    return 'ok';
  }

  async function resend(): Promise<ResendResult> {
    if (!token) return { ok: false, message: t('error.captcha') };
    const r = await send(true);
    if (r.ok) return true;
    return { ok: false, message: r.error === 'new_account' || r.error === 'email_account' ? t('error.generic') : errorText(r) };
  }

  // ── Code step ────────────────────────────────────────────────────────────
  if (step === 'code') {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-mute text-center leading-relaxed">
          {t.rich('codeSent', {
            phone,
            b: (chunks) => <span dir="ltr" className="text-ink font-medium tabular-nums">{chunks}</span>,
          })}
        </p>
        <CodeStep
          onVerify={verify}
          onResend={resend}
          onBack={() => { setStep('phone'); setError(''); }}
          backLabel={t('changeNumber')}
        />
        {/* A resend is another SMS, so it needs its own human check. */}
        <Turnstile siteKey={siteKey} action={TURNSTILE_ACTION_PHONE} onToken={setToken} resetSignal={resetSignal} />
      </div>
    );
  }

  // ── Phone step ───────────────────────────────────────────────────────────
  const emailQuery = { method: 'email', ...(back ? { returnUrl: back } : {}) };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate className="flex flex-col gap-5">
      {error && (
        <div id="phone-error" role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {error}
        </div>
      )}

      {notice?.kind === 'email_account' && (
        <div role="status" className="flex flex-col gap-3 rounded-[14px] border border-rule bg-paper-warm px-4 py-3 text-sm text-ink-soft leading-relaxed">
          <p>
            {notice.emailHint
              ? t.rich('emailAccount.body', {
                  email: notice.emailHint,
                  b: (chunks) => <span dir="ltr" className="font-medium text-ink">{chunks}</span>,
                })
              : t('emailAccount.bodyNoHint')}
          </p>
          <Link
            href={{ pathname: '/sign-in', query: emailQuery }}
            className="inline-flex min-h-11 items-center justify-center rounded-[999px] bg-ink text-white text-sm font-medium px-5 py-2.5 transition-opacity duration-[240ms] hover:opacity-80"
          >
            {t('emailAccount.cta')}
          </Link>
        </div>
      )}

      {notice?.kind === 'new_account' && (
        <div role="status" className="flex flex-col gap-3 rounded-[14px] border border-rule bg-paper-warm px-4 py-3 text-sm text-ink-soft leading-relaxed">
          <p>{t('newAccount.body')}</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => { setCreateConfirmed(true); void submit(true); }}
            className="inline-flex min-h-11 items-center justify-center rounded-[999px] bg-stay text-white text-sm font-medium px-5 py-2.5 transition-opacity duration-[240ms] hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t('sending') : t('newAccount.create')}
          </button>
          <Link href={{ pathname: '/sign-in', query: emailQuery }} className="text-center text-sm text-mute hover:text-ink transition-colors duration-[240ms]">
            {t('newAccount.useEmail')}
          </Link>
        </div>
      )}

      <PhoneInput
        value={phone}
        onChange={(v) => { setPhone(v); setNotice(null); setCreateConfirmed(false); }}
        defaultCountry="TR"
        label={t('label')}
        searchPlaceholder={t('searchPlaceholder')}
        errorId={error ? 'phone-error' : undefined}
        invalid={Boolean(error)}
      />

      <Turnstile siteKey={siteKey} action={TURNSTILE_ACTION_PHONE} onToken={setToken} resetSignal={resetSignal} />

      {notice === null && (
        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-11 rounded-[999px] bg-stay text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-50"
        >
          {loading ? t('sending') : t('submit')}
        </button>
      )}

      <p className="text-xs text-mute text-center leading-relaxed">
        {t(intent === 'sign-up' ? 'hintSignUp' : 'hint')}
      </p>
    </form>
  );
}
