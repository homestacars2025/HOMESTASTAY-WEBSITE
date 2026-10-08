import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { SignInForm } from '@/components/auth/SignInForm';
import { isGoogleAuthEnabled } from '@/lib/auth/providers';
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

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnUrl?: string; portal?: string; next?: string; notice?: string }>;
}) {
  // Resolved on the server: the button is hidden unless the provider is
  // actually enabled — see lib/auth/providers for what happens when it is not.
  const googleEnabled = await isGoogleAuthEnabled();
  const { locale } = await params;
  const { returnUrl, portal, next: rawNext, notice } = await searchParams;
  // The portal sends ?notice=sign-in-again after an invalid or expired
  // handoff, or a session that never passed the email code. Not an error the
  // host caused — a calm, one-line reason, above the form.
  const signInAgain = notice === 'sign-in-again';
  const t = await getTranslations({ locale, namespace: 'auth.signIn' });

  // ── Portal entry: /sign-in?portal=host&next=/bookings ────────────────────
  // The host portal sends hosts here to sign in — the website is the only
  // gateway. `next` (allow-listed) rides through to the handoff.
  const hostPortal = portal === 'host';
  const next = hostPortal ? hostNextPath(rawNext) : null;

  // Already signed in with portal=host: an owner goes straight through the
  // handoff, staff and blocked accounts get their notice from the continue
  // route — and a GUEST is asked, not sent to the application form: they may
  // simply be signed in with the wrong account.
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
              {guestWho !== null ? t('guestTitle') : t('title')}
            </h1>
            {guestWho === null && <p className="text-sm text-mute">{t('subtitle')}</p>}
          </div>

          {signInAgain && guestWho === null && (
            <div role="status" className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-rule bg-paper-warm px-4 py-3 text-sm text-ink-soft leading-relaxed">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
              <span>{t('signInAgain')}</span>
            </div>
          )}

          {/* Card */}
          <div className="bg-white border border-rule rounded-[14px] p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
            {guestWho !== null ? (
              <HostPortalInterstitial locale={locale} who={guestWho} next={next} />
            ) : (
            <SignInForm
              returnUrl={returnUrl || undefined}
              next={next}
              googleEnabled={googleEnabled}
            />
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
