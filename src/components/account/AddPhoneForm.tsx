'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncProfileFromAuth } from '@/lib/auth/sync-profile';
import { requestPhoneChange, type PhoneChangeResult } from '@/lib/auth/phone-actions';
import { TURNSTILE_ACTION_PHONE } from '@/lib/security/turnstile-action';
import { Turnstile } from '@/components/security/Turnstile';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { CodeStep, verifyResultFrom, type ResendResult, type VerifyResult } from '@/components/auth/CodeStep';

/**
 * Add & verify a phone on the signed-in account (updateUser({ phone }) →
 * SMS code → verifyOtp type 'phone_change'), so it can sign in by phone too.
 *
 * The SMS is requested by the server action (human check, limits, and a
 * number already on another account refused up front) — never from here. The
 * database records the verified number on the profile; the sync below is the
 * website's own copy of the same write.
 */
export function AddPhoneForm({ siteKey }: { siteKey: string }) {
  const t = useTranslations('account');
  const router = useRouter();

  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  function errorText(r: Extract<PhoneChangeResult, { ok: false }>): string {
    switch (r.error) {
      case 'invalid':          return t('error.phoneInvalid');
      case 'phone_exists':     return t('error.phoneExists');
      case 'captcha':          return t('error.captcha');
      case 'rate_limited':
      case 'sms_rate_limited': return t('error.rateLimited');
      case 'send_failed':      return t('error.sendFailed');
      case 'signed_out':       return t('error.signedOut');
      case 'unavailable':      return t('error.unavailable');
      default:                 return t('error.generic');
    }
  }

  async function send(): Promise<PhoneChangeResult> {
    const captchaToken = token;
    setResetSignal((n) => n + 1); // tokens are single-use
    return requestPhoneChange({ phone, captchaToken });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !isValidPhoneNumber(phone)) { setError(t('error.phoneInvalid')); return; }
    if (!token) { setError(t('error.captcha')); return; }
    setError('');
    setLoading(true);
    const r = await send();
    setLoading(false);
    if (r.ok) setStep('code');
    else setError(errorText(r));
  }

  async function verify(code: string): Promise<VerifyResult> {
    const { data, error: otpError } = await createClient().auth.verifyOtp({ phone, token: code, type: 'phone_change' });
    const outcome = verifyResultFrom(otpError, Boolean(data.user));
    if (outcome !== 'ok') return outcome;
    await syncProfileFromAuth().catch(() => null);
    setStep('done');
    router.refresh();
    return 'ok';
  }

  async function resend(): Promise<ResendResult> {
    if (!token) return { ok: false, message: t('error.captcha') };
    const r = await send();
    return r.ok ? true : { ok: false, message: errorText(r) };
  }

  if (step === 'done') {
    return <p role="status" className="text-sm text-ink leading-relaxed">{t('phoneAdded')}</p>;
  }

  if (step === 'code') {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-mute text-center leading-relaxed">
          {t.rich('codeSent', { phone, b: (chunks) => <span dir="ltr" className="text-ink font-medium tabular-nums">{chunks}</span> })}
        </p>
        <CodeStep onVerify={verify} onResend={resend} onBack={() => { setStep('phone'); setError(''); }} backLabel={t('changeNumber')} />
        <Turnstile siteKey={siteKey} action={TURNSTILE_ACTION_PHONE} onToken={setToken} resetSignal={resetSignal} />
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error && (
        <div id="add-phone-error" role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {error}
        </div>
      )}
      <PhoneInput
        value={phone}
        onChange={setPhone}
        defaultCountry="TR"
        label={t('phoneLabel')}
        searchPlaceholder={t('searchPlaceholder')}
        errorId={error ? 'add-phone-error' : undefined}
        invalid={Boolean(error)}
      />
      <Turnstile siteKey={siteKey} action={TURNSTILE_ACTION_PHONE} onToken={setToken} resetSignal={resetSignal} />
      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-11 rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80 disabled:opacity-50"
      >
        {loading ? t('sending') : t('sendCode')}
      </button>
    </form>
  );
}
