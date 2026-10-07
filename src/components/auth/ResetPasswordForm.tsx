'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

const inputClass =
  'w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]';

interface ResetPasswordFormProps {
  /** From the reset email's link: ?token_hash=…&type=recovery */
  tokenHash: string | null;
  type: string | null;
}

/**
 * The page a password-reset email lands on.
 *
 * The one-time token is exchanged only when the guest submits a new password
 * — not on page load — so a mail scanner that opens the link cannot burn it.
 * Afterwards the session is signed out LOCALLY and the guest signs in with the
 * new password through the normal door (which also routes hosts and staff to
 * where they belong).
 */
export function ResetPasswordForm({ tokenHash, type }: ResetPasswordFormProps) {
  const t = useTranslations('auth.resetPassword');

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);
  const [loading,  setLoading]  = useState(false);

  if (!tokenHash || type !== 'recovery') {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-ink-soft leading-relaxed">{t('error.invalidLink')}</p>
        <Link href="/forgot-password" className="text-sm text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]">
          {t('requestNew')}
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError(t('error.tooShort')); return; }
    if (password !== confirm) { setError(t('error.mismatch')); return; }

    setError('');
    setLoading(true);
    const supabase = createClient();

    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: 'recovery' });
    if (verifyError) {
      setLoading(false);
      setError(t('error.invalidLink'));
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    await supabase.auth.signOut({ scope: 'local' });
    setLoading(false);

    if (updateError) {
      setError(updateError.code === 'same_password' ? t('error.samePassword') : t('error.generic'));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-4 text-center">
        <p className="text-sm text-ink-soft leading-relaxed">{t('success')}</p>
        <Link href="/sign-in?method=email" className="inline-flex min-h-11 w-full items-center justify-center rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {error && (
        <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {error}
          {error === t('error.invalidLink') && (
            <>
              {' '}
              <Link href="/forgot-password" className="font-medium underline underline-offset-2">{t('requestNew')}</Link>
            </>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-sm font-medium text-ink">{t('passwordLabel')}</label>
        <input id="new-password" type="password" autoComplete="new-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium text-ink">{t('confirmLabel')}</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-11 rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70 disabled:opacity-50"
      >
        {loading ? t('loading') : t('submit')}
      </button>
    </form>
  );
}
