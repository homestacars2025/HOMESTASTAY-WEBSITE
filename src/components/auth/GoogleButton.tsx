'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

/**
 * "Continue with Google" — the same button on sign-in and sign-up.
 *
 * ONE COMPONENT FOR BOTH because the flows are genuinely identical: Google
 * does not distinguish signing in from registering, and neither does Supabase.
 * A first-time guest gets a user and a profile (see the callback route); a
 * returning one just gets a session. Only the label differs, and it does not
 * differ enough to justify two of these.
 *
 * The email/password forms are untouched by this. It sits beside them.
 */

/** The official four-colour mark, at the official proportions. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function GoogleButton({ returnUrl }: { returnUrl?: string }) {
  const t = useTranslations('auth.oauth');
  const locale = useLocale();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setError('');
    setLoading(true);

    /**
     * The site's own origin, and an env var only to override it.
     *
     * NEXT_PUBLIC_SITE_URL is what a deployment can pin the callback to; when
     * it is unset, window.location.origin is already correct in every
     * environment — localhost in dev, the deployment host in preview, the
     * domain in production — which is exactly the "no hardcoded URL" the
     * callback needs. NOT CANONICAL_URL: that always resolves to the
     * production domain, so signing in on localhost would bounce the developer
     * to homestastay.com holding the code.
     */
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    // The locale and destination ride in the query string: the callback is a
    // /api route, so it is outside next-intl's routing and cannot infer either.
    const callback = new URL('/api/auth/callback', siteUrl);
    callback.searchParams.set('locale', locale);
    if (returnUrl) callback.searchParams.set('returnUrl', returnUrl);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    });

    // Reached only if the redirect itself could not be started — a misconfigured
    // provider, or the network. A successful call navigates away and nothing
    // below runs, so `loading` is deliberately left true in that case.
    if (oauthError) {
      console.error('[auth] google sign-in failed to start', { message: oauthError.message });
      setError(t('error.failed'));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        // gap, not a margin: the icon sits on the leading side and flips with
        // the document direction in Arabic without any RTL-specific rule.
        className="w-full flex items-center justify-center gap-2.5 rounded-[999px] border border-rule bg-paper text-ink text-sm font-medium py-3 transition-colors duration-[240ms] hover:bg-paper-warm disabled:opacity-50"
      >
        <GoogleMark />
        {loading ? t('loading') : t('continueWithGoogle')}
      </button>
    </div>
  );
}

/** "or" between the Google button and the email form. */
export function AuthDivider() {
  const t = useTranslations('auth.oauth');
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-rule" />
      <span className="text-xs text-mute">{t('or')}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
