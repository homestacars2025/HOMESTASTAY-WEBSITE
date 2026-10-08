import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { HostVerifyForm } from '@/components/auth/HostVerifyForm';
import { createClient } from '@/lib/supabase/server';
import { accountKind } from '@/lib/auth/account-role';
import { continueUrl } from '@/lib/auth/continue-url';
import { hostNextPath } from '@/lib/auth/portals';
import { isHostOtpRequired, maskEmail } from '@/lib/auth/host-otp';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.hostVerify' });
  return { title: `${t('title')} — Homesta Stay`, robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/**
 * The host's second step: a 6-digit email code, every sign-in, before the
 * portal handoff. Reached only from /api/auth/continue for an owner.
 *
 * Anyone else is sent back where they belong: no session → host sign-in;
 * not an owner → the continue route decides.
 */
export default async function HostVerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const next = hostNextPath((await searchParams).next);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/sign-in?portal=host${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  }
  // Not an owner — or the code is switched off (host_login_otp_required), in
  // which case the continue route hands an owner straight to the portal.
  if ((await accountKind(user.id)) !== 'owner' || !user.email || !(await isHostOtpRequired())) {
    redirect(continueUrl(null, locale, next));
  }

  const t = await getTranslations({ locale, namespace: 'auth.hostVerify' });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 text-center">
            <p className="mb-3 inline-flex items-center rounded-[999px] border border-rule bg-paper-warm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-soft">
              {t('label')}
            </p>
            <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-medium tracking-[-0.035em] text-ink mb-2 leading-tight">
              {t('title')}
            </h1>
            <p className="text-sm text-mute">{t('subtitle')}</p>
          </div>
          <div className="bg-white border border-rule rounded-[14px] p-6 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
            <HostVerifyForm maskedEmail={maskEmail(user.email)} next={next} />
          </div>
        </div>
      </main>
    </div>
  );
}
