'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  'w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]';

/**
 * Asks Supabase for a password-reset email.
 *
 * redirectTo names this site's /reset-password so the "Reset Password"
 * template can send website guests here (see that page). The answer is the
 * same whether or not an account exists for the address: saying otherwise
 * would let anyone test which emails are registered.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgotPassword');

  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) { setError(t('error.emailInvalid')); return; }

    setError('');
    setLoading(true);
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (resetError && (resetError.status === 429 || resetError.code === 'over_email_send_rate_limit')) {
      setError(t('error.rateLimited'));
      return;
    }
    // Any other failure reads as "sent" too — see the comment above.
    if (resetError) console.warn('[forgot-password] request failed', { code: resetError.code, status: resetError.status });
    setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-4 text-center">
        <p className="text-sm text-ink-soft leading-relaxed">{t('sent', { email: email.trim() })}</p>
        <Link href="/sign-in?method=email" className="text-sm text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]">
          {t('backToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {error && (
        <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">{t('emailLabel')}</label>
        <input
          id="email" type="email" inputMode="email" autoComplete="email" required dir="ltr"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={`${inputClass} text-start`}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-11 rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70 disabled:opacity-50"
      >
        {loading ? t('loading') : t('submit')}
      </button>
      <p className="text-center text-sm">
        <Link href="/sign-in?method=email" className="text-mute hover:text-ink transition-colors duration-[240ms]">
          {t('backToSignIn')}
        </Link>
      </p>
    </form>
  );
}
