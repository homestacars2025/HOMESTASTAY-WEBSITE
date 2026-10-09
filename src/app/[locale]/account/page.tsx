import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { AddPhoneForm } from '@/components/account/AddPhoneForm';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';
import { isTurnstileConfigured } from '@/lib/security/turnstile';
import { toE164 } from '@/lib/auth/profile-gap';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account' });
  return { title: `${t('title')} — Homesta Stay`, robots: { index: false, follow: false } };
}

/**
 * The guest's account: who they are, and — the reason this page exists —
 * "Add & verify phone", so an email account can also sign in by phone.
 * Guests only (requireConfirmedUser sends hosts and staff on).
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireConfirmedUser(locale, '/account');
  const t = await getTranslations({ locale, namespace: 'account' });

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  const name = [profile?.first_name, profile?.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ');
  const verifiedPhone = user.phone_confirmed_at ? toE164(user.phone) : null;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
  const canAddPhone = isTurnstileConfigured() && siteKey !== '';

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-1 py-3 border-b border-rule last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute">{label}</dt>
      <dd className="text-sm text-ink break-all">{value}</dd>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-full max-w-[520px] flex flex-col gap-6">
          <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-medium tracking-[-0.035em] text-ink leading-tight">{t('title')}</h1>

          <section className="bg-white border border-rule rounded-[14px] px-6 py-2">
            <dl>
              {row(t('name'), name || '—')}
              {row(t('email'), <span dir="ltr">{user.email}</span>)}
              {row(t('phone'), verifiedPhone
                ? <span dir="ltr" className="tabular-nums">{verifiedPhone} <span className="text-mute">· {t('verified')}</span></span>
                : <span className="text-mute">{t('noPhone')}</span>)}
            </dl>
          </section>

          {canAddPhone && (
            <section className="bg-white border border-rule rounded-[14px] p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-base font-medium text-ink mb-1">{verifiedPhone ? t('changePhone') : t('addPhone')}</h2>
                <p className="text-sm text-ink-soft leading-relaxed">{t('addPhoneIntro')}</p>
              </div>
              <AddPhoneForm siteKey={siteKey} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
