import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { PhoneSignInForm } from '@/components/auth/PhoneSignInForm';
import { GoogleButton, AuthDivider } from '@/components/auth/GoogleButton';
import { MethodSwitchLink } from '@/components/auth/MethodSwitchLink';
import { isGoogleAuthEnabled } from '@/lib/auth/providers';
import { safeReturnPath } from '@/lib/auth/profile-gap';
import { isTurnstileConfigured } from '@/lib/security/turnstile';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.signUp' });
  return { title: `${t('title')} — Homesta Stay` };
}

/**
 * Phone first — the same form as sign-in, since the first verified code
 * creates the account. Email sign-up (password + email code + mandatory phone)
 * is one link away.
 */
export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnUrl?: string; method?: string }>;
}) {
  // Resolved on the server: the button is hidden unless the provider is
  // actually enabled — see lib/auth/providers for what happens when it is not.
  const googleEnabled = await isGoogleAuthEnabled();
  const { locale } = await params;
  const { returnUrl: rawReturnUrl, method } = await searchParams;
  const returnUrl = safeReturnPath(rawReturnUrl) || undefined;
  // Phone sign-in needs the human check (Cloudflare Turnstile) — every SMS is
  // gated by it. Without the keys the phone tab is not offered at all and the
  // page is email-only, rather than a phone form that cannot send.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
  const phoneAvailable = isTurnstileConfigured() && siteKey !== '';
  const current = !phoneAvailable ? 'email' : method === 'email' ? 'email' : 'phone';
  const t = await getTranslations({ locale, namespace: 'auth.signUp' });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-full max-w-[460px]">

          {/* Page heading */}
          <div className="mb-8 text-center">
            <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-medium tracking-[-0.035em] text-ink mb-2 leading-tight">
              {t('title')}
            </h1>
            <p className="text-sm text-mute">{t(current === 'phone' ? 'phoneSubtitle' : 'subtitle')}</p>
          </div>

          {/* Card */}
          <div className="relative z-10 bg-white border border-rule rounded-[14px] p-6 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
            {current === 'email' ? (
              <SignUpForm returnUrl={returnUrl} googleEnabled={googleEnabled} />
            ) : (
              <div className="flex flex-col gap-5">
                <PhoneSignInForm returnUrl={returnUrl} intent="sign-up" siteKey={siteKey} />
                {googleEnabled && (
                  <>
                    <AuthDivider />
                    <GoogleButton returnUrl={returnUrl} />
                  </>
                )}
              </div>
            )}
          </div>

          {phoneAvailable && <MethodSwitchLink page="/sign-up" current={current} returnUrl={returnUrl} />}

        </div>
      </main>
    </div>
  );
}
