import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.resetPassword' });
  return { title: `${t('title')} — Homesta Stay`, robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { locale } = await params;
  const { token_hash, type } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'auth.resetPassword' });

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
            <ResetPasswordForm tokenHash={token_hash ?? null} type={type ?? null} />
          </div>
        </div>
      </main>
    </div>
  );
}
