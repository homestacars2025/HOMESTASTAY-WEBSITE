import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { CompleteProfileForm } from '@/components/auth/CompleteProfileForm';
import { createClient } from '@/lib/supabase/server';
import { profileGap, safeReturnPath } from '@/lib/auth/profile-gap';
import { accountKind } from '@/lib/auth/account-role';
import { continueUrl } from '@/lib/auth/continue-url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.completeProfile' });
  return {
    title: `${t('title')} — Homesta Stay`,
    robots: { index: false, follow: false },
  };
}

/**
 * Where an account is finished: name + verified email after phone sign-up,
 * verified phone after email sign-up. What to ask is read from the account on
 * the server, never from the URL, so the page cannot be talked into skipping
 * a step — and a guest with nothing left to do is sent straight on.
 */
export default async function CompleteProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { locale } = await params;
  const { returnUrl: rawReturnUrl } = await searchParams;
  const returnUrl = safeReturnPath(rawReturnUrl);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/sign-in${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`);
  }

  // Never shown to hosts or staff: completing a GUEST profile is not their
  // step. /api/auth/continue hands a host to the portal and points staff at
  // their own sign-in.
  if ((await accountKind(user.id)) !== 'customer') {
    redirect(continueUrl(returnUrl || null, locale));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  const gap = profileGap(user, profile?.first_name);
  // The phone is optional here (added on the Account page); a name and a
  // verified email are what an account needs.
  if (!gap.email && !gap.name) {
    redirect(continueUrl(returnUrl || null, locale));
  }

  const t = await getTranslations({ locale, namespace: 'auth.completeProfile' });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 text-center">
            <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-medium tracking-[-0.035em] text-ink mb-2 leading-tight">
              {t('title')}
            </h1>
            <p className="text-sm text-mute">{t('subtitle')}</p>
          </div>

          <div className="relative z-10 bg-white border border-rule rounded-[14px] p-6 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
            <CompleteProfileForm
              gap={gap}
              firstName={profile?.first_name ?? null}
              lastName={profile?.last_name ?? null}
              returnUrl={returnUrl || undefined}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
