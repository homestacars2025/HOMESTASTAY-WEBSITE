import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.forgotPassword' });
  return { title: `${t('title')} — Homesta Stay`, robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;

}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.forgotPassword' });

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
          <div className="bg-white border border-rule rounded-[14px] p-6 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
            <ForgotPasswordForm />
          </div>
        </div>
      </main>
    </div>
  );
}
