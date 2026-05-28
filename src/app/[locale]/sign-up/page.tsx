import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { SignUpForm } from '@/components/auth/SignUpForm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.signUp' });
  return { title: `${t('title')} — Homesta Stay` };
}

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { locale } = await params;
  const { returnUrl } = await searchParams;
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
            <p className="text-sm text-mute">{t('subtitle')}</p>
          </div>

          {/* Card */}
          <div className="bg-white border border-rule rounded-[14px] p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
            <SignUpForm returnUrl={returnUrl ? decodeURIComponent(returnUrl) : undefined} />
          </div>

        </div>
      </main>
    </div>
  );
}
