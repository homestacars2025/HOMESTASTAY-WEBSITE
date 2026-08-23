'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { GoogleButton, AuthDivider } from '@/components/auth/GoogleButton';
import { createClient } from '@/lib/supabase/client';
import type { AuthError } from '@supabase/supabase-js';

interface SignInFormProps {
  returnUrl?: string;
  /** False when Google is not enabled on the Supabase project — see
   *  lib/auth/providers. A button that cannot work is worse than no button. */
  googleEnabled?: boolean;
}

/**
 * Supabase reports an unverified address as `code: 'email_not_confirmed'` on
 * current versions and as a bare message on older ones. Both are checked so a
 * client upgrade cannot silently turn this back into a generic credentials
 * error — which would strand the user with no way forward.
 */
function isEmailNotConfirmed(error: AuthError): boolean {
  return (
    error.code === 'email_not_confirmed' ||
    /email\s+not\s+confirmed/i.test(error.message)
  );
}

export function SignInForm({ returnUrl, googleEnabled = false }: SignInFormProps) {
  const t      = useTranslations('auth.signIn');
  const tOauth = useTranslations('auth.oauth');
  const router = useRouter();

  /**
   * An OAuth failure happens OFF-SITE — at Google's consent screen — so the
   * callback route sends the guest back here with a flag rather than trying to
   * report it from a page that no longer exists. Dismissing the consent screen
   * is not an error to apologise for, so it gets its own gentler wording.
   */
  const authError = useSearchParams().get('authError');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  function validate(): string {
    if (!email.trim() || !password) return t('error.requiredField');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('error.emailInvalid');
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validate();
    if (msg) { setError(msg); return; }

    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      // Credentials were correct — the address simply isn't verified yet.
      // "Wrong email or password" would be untrue AND offer no way out, so
      // send them to the page that can resend the code. Loading stays true:
      // the navigation is in flight and a second submit helps nobody.
      if (isEmailNotConfirmed(authError)) {
        router.push(
          `/verify-email?email=${encodeURIComponent(email)}` +
            (returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''),
        );
        return;
      }
      setError(t('error.invalidCredentials'));
      setLoading(false);
    } else {
      router.push(returnUrl || '/');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

      {(error || authError) && (
        <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
          {error || tOauth(authError === 'cancelled' ? 'error.cancelled' : 'error.failed')}
        </div>
      )}

      {/* Google first: it is one tap, and a guest who has an account through it
          should not have to read past a password field to find it. */}
      {googleEnabled && (
        <>
          <GoogleButton returnUrl={returnUrl} />
          <AuthDivider />
        </>
      )}

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          {t('emailLabel')}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          required
          className="w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            {t('passwordLabel')}
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-mute hover:text-ink transition-colors duration-[240ms] shrink-0"
          >
            {t('forgotPassword')}
          </Link>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border border-rule rounded-[8px] px-4 py-2.5 text-sm text-ink bg-paper placeholder:text-mute focus:outline-none focus:border-ink transition-colors duration-[240ms]"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70 disabled:opacity-50"
      >
        {loading ? t('loading') : t('submit')}
      </button>

      {/* Cross-link */}
      <p className="text-center text-sm text-mute">
        {t('noAccount')}{' '}
        <Link
          href="/sign-up"
          className="text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
        >
          {t('createAccount')}
        </Link>
      </p>
    </form>
  );
}
