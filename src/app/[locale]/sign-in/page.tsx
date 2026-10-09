import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { SignInForm } from '@/components/auth/SignInForm';
import { PhoneSignInForm } from '@/components/auth/PhoneSignInForm';
import { GoogleButton, AuthDivider } from '@/components/auth/GoogleButton';
import { MethodSwitchLink } from '@/components/auth/MethodSwitchLink';
import { isGoogleAuthEnabled } from '@/lib/auth/providers';
import { safeReturnPath } from '@/lib/auth/profile-gap';
import { isTurnstileConfigured } from '@/lib/security/turnstile';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { accountKind } from '@/lib/auth/account-role';
import { continueUrl } from '@/lib/auth/continue-url';
import { hostNextPath } from '@/lib/auth/portals';
import { HostPortalInterstitial } from '@/components/auth/HostPortalInterstitial';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.signIn' });
  return { title: `${t('title')} — Homesta Stay` };
}

/**
 * Phone first; email (the original password sign-in, unchanged) one link
 * away. Google, when enabled, is offered with either.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnUrl?: string; method?: string; authError?: string; portal?: string; next?: string; notice?: string }>;
}) {
  // Resolved on the server: the button is hidden unless the provider is
  // actually enabled — see lib/auth/providers for what happens when it is not.
  const googleEnabled = await isGoogleAuthEnabled();
  const { locale } = await params;
  const { returnUrl: rawReturnUrl, method, authError, portal, next: rawNext, notice } = await searchParams;
  // The portal's "please sign in again" (invalid/expired handoff, unverified session).
  const signInAgain = notice === 'sign-in-again';
  const returnUrl = safeReturnPath(rawReturnUrl) || undefined;
  // Hosts arriving from the portal sign in with email (owners have no auth
  // phone yet), so the portal entry always opens the email form.
  const hostPortal = portal === 'host';
  const next = hostPortal ? hostNextPath(rawNext) : null;
  // Phone sign-in needs the human check (Cloudflare Turnstile) — every SMS is
  // gated by it. Without the keys the phone tab is not offered at all and the
  // page is email-only, rather than a phone form that cannot send.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
  const phoneAvailable = isTurnstileConfigured() && siteKey !== '';
  const current = !phoneAvailable ? 'email' : method === 'email' || hostPortal ? 'email' : 'phone';

  // Already signed in with portal=host: an owner goes straight through, staff
  // and blocked accounts get their notice from the continue route, and a GUEST
  // is asked (HostPortalInterstitial) — they may be on the wrong account.
  let guestWho: string | null = null;
  if (hostPortal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const kind = await accountKind(user.id);
      if (kind !== 'customer') redirect(continueUrl(null, locale, next));
      const first = typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : '';
      const last  = typeof user.user_metadata?.last_name === 'string' ? user.user_metadata.last_name.trim() : '';
      guestWho = [first, last].filter(Boolean).join(' ') || user.email || '';
    }
  }
  const t      = await getTranslations({ locale, namespace: 'auth.signIn' });
  const tOauth = await getTranslations({ locale, namespace: 'auth.oauth' });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-full max-w-[420px]">

          {/* Page heading */}
          <div className="mb-8 text-center">
            {hostPortal && (
              <p className="mb-3 inline-flex items-center rounded-[999px] border border-rule bg-paper-warm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-soft">
                {t('forHosts')}
              </p>
            )}
            <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-medium tracking-[-0.035em] text-ink mb-2 leading-tight">
              {t('title')}
            </h1>
            <p className="text-sm text-mute">{t(current === 'phone' ? 'phoneSubtitle' : 'subtitle')}</p>
          </div>

          {signInAgain && guestWho === null && (
            <div role="status" className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-rule bg-paper-warm px-4 py-3 text-sm text-ink-soft leading-relaxed">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
              <span>{t('signInAgain')}</span>
            </div>
          )}

          {/* Card */}
          <div className="relative z-10 bg-white border border-rule rounded-[14px] p-6 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
            {guestWho !== null ? (
              <HostPortalInterstitial locale={locale} who={guestWho} next={next} />
            ) : current === 'email' ? (
              <SignInForm returnUrl={returnUrl} next={next} googleEnabled={googleEnabled} />
            ) : (
              <div className="flex flex-col gap-5">
                {/* The email form reports OAuth failures itself; here the
                    page does, since the callback always lands on /sign-in. */}
                {authError && (
                  <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
                    {tOauth(authError === 'cancelled' ? 'error.cancelled' : 'error.failed')}
                  </div>
                )}
                <PhoneSignInForm returnUrl={returnUrl} intent="sign-in" siteKey={siteKey} />
                {googleEnabled && (
                  <>
                    <AuthDivider />
                    <GoogleButton returnUrl={returnUrl} />
                  </>
                )}
              </div>
            )}
          </div>

          {phoneAvailable && !hostPortal && <MethodSwitchLink page="/sign-in" current={current} returnUrl={returnUrl} />}

        </div>
      </main>
    </div>
  );
}
