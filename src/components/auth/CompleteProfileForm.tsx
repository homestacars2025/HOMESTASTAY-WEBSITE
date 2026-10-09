'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncProfileFromAuth } from '@/lib/auth/sync-profile';
import { safeReturnPath, type ProfileGap } from '@/lib/auth/profile-gap';
import { continueUrl } from '@/lib/auth/continue-url';
import { CodeStep, verifyResultFrom, type VerifyResult } from './CodeStep';

interface CompleteProfileFormProps {
  /** What the account lacks, worked out on the server from getUser(). */
  gap: ProfileGap;
  firstName: string | null;
  lastName: string | null;
  returnUrl?: string;
}

type Step = 'details' | 'emailCode';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  'w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]';
const primaryClass =
  'w-full min-h-11 rounded-[999px] bg-stay text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-50';

/**
 * Finishes a new account: first and last name, and — for a phone sign-up — a
 * verified email (updateUser({ email }) → 6-digit code, type email_change).
 *
 * There is no "skip": bookings, the wallet and My bookings are keyed on a
 * verified email, and a booking needs both names. A phone is NOT asked for
 * here: phone accounts already have one, and email accounts add theirs on the
 * Account page (gated by the human check, like every SMS).
 *
 * Every successful code is followed by syncProfileFromAuth, which copies the
 * VERIFIED value into profiles server-side.
 */
export function CompleteProfileForm({ gap, firstName: initialFirst, lastName: initialLast, returnUrl }: CompleteProfileFormProps) {
  const t      = useTranslations('auth.completeProfile');
  const locale = useLocale();
  const back   = safeReturnPath(returnUrl);

  const [step,      setStep]      = useState<Step>('details');
  const [firstName, setFirstName] = useState(initialFirst ?? '');
  const [lastName,  setLastName]  = useState(initialLast ?? '');
  const [email,     setEmail]     = useState('');
  const [error,     setError]     = useState<{ key: string; link?: 'emailSignIn' } | null>(null);
  const [loading,   setLoading]   = useState(false);

  /** Done: the common exit every sign-in takes, as a full page load. */
  function finish() {
    window.location.assign(continueUrl(back || null, locale));
  }

  // ── Details: name, and the email if it is not verified yet ────────────────
  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || (gap.email && !email.trim())) {
      setError({ key: 'error.requiredField' });
      return;
    }
    if (gap.email && !EMAIL_RE.test(email.trim())) {
      setError({ key: 'error.emailInvalid' });
      return;
    }
    setError(null);
    setLoading(true);

    // Names first, so they are kept even if the guest abandons the email code.
    await syncProfileFromAuth({ firstName, lastName }).catch(() => null);

    // The name also goes on the auth user: the header reads user_metadata,
    // and a phone sign-up has none. Same call as the email when there is one.
    const supabase = createClient();
    const address  = email.trim().toLowerCase();
    const meta     = { first_name: firstName.trim(), last_name: lastName.trim() };

    if (!gap.email) {
      await supabase.auth.updateUser({ data: meta });
      finish();
      return;
    }

    const { data, error: updateError } = await supabase.auth.updateUser({ email: address, data: meta });
    setLoading(false);

    if (updateError) {
      if (updateError.code === 'email_exists') {
        setError({ key: 'error.emailExists', link: 'emailSignIn' });
      } else if (updateError.code === 'email_address_invalid' || updateError.code === 'validation_failed') {
        setError({ key: 'error.emailInvalid' });
      } else if (updateError.code === 'over_email_send_rate_limit' || updateError.status === 429) {
        setError({ key: 'error.rateLimited' });
      } else {
        console.warn('[complete-profile] email update failed', { code: updateError.code, status: updateError.status });
        setError({ key: 'error.generic' });
      }
      return;
    }

    // With "confirm email change" off the address applies at once and no code
    // is sent. Not the project's setting, but not a dead end either.
    if (data.user?.email === address && data.user.email_confirmed_at) {
      await syncProfileFromAuth().catch(() => null);
      finish();
      return;
    }
    setEmail(address);
    setStep('emailCode');
  }

  async function verifyEmail(code: string): Promise<VerifyResult> {
    const supabase = createClient();
    const { data, error: otpError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email_change' });
    const outcome = verifyResultFrom(otpError, Boolean(data.user));
    if (outcome !== 'ok') return outcome;

    await syncProfileFromAuth().catch(() => null);
    finish();
    return 'ok';
  }

  async function resendEmail(): Promise<boolean> {
    const { error: resendError } = await createClient().auth.resend({ type: 'email_change', email });
    return !resendError;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const errorBox = error && (
    <div id="complete-profile-error" role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
      {t(error.key)}
      {error.link && (
        <>
          {' '}
          <Link
            href={`/sign-in?method=email${back ? `&returnUrl=${encodeURIComponent(back)}` : ''}`}
            className="font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
          >
            {t('signInWithEmail')}
          </Link>
        </>
      )}
    </div>
  );

  const stepLabel = (
    <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute text-center">
      {t('stepEmail')}
    </p>
  );

  if (step === 'emailCode') {
    return (
      <div className="flex flex-col gap-5">
        {stepLabel}
        <p className="text-sm text-mute text-center leading-relaxed">
          {t.rich('emailCodeSent', {
            email,
            b: (chunks) => <span dir="ltr" className="text-ink font-medium">{chunks}</span>,
          })}
        </p>
        <CodeStep
          onVerify={verifyEmail}
          onResend={resendEmail}
          onBack={() => { setError(null); setStep('details'); }}
          backLabel={t('changeEmail')}
        />
      </div>
    );
  }

  return (
    <form onSubmit={submitDetails} noValidate className="flex flex-col gap-5">
      {gap.email && stepLabel}
      {errorBox}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="first-name" className="text-sm font-medium text-ink">
            {t('firstNameLabel')} <span className="text-stay" aria-hidden="true">*</span>
          </label>
          <input
            id="first-name" type="text" autoComplete="given-name" required
            value={firstName} onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="last-name" className="text-sm font-medium text-ink">
            {t('lastNameLabel')} <span className="text-stay" aria-hidden="true">*</span>
          </label>
          <input
            id="last-name" type="text" autoComplete="family-name" required
            value={lastName} onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {gap.email && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ink">
            {t('emailLabel')} <span className="text-stay" aria-hidden="true">*</span>
          </label>
          <input
            id="email" type="email" inputMode="email" autoComplete="email" required dir="ltr"
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            aria-describedby="email-why"
            className={`${inputClass} text-start`}
          />
          <p id="email-why" className="text-xs text-mute leading-relaxed">{t('emailWhy')}</p>
        </div>
      )}

      <button type="submit" disabled={loading} className={primaryClass}>
        {loading ? t('loading') : t(gap.email ? 'sendEmailCode' : 'continue')}
      </button>
    </form>
  );
}
