import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { OtpForm } from '@/components/auth/OtpForm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.verifyEmail' });
  return { title: `${t('title')} — Homesta Stay` };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string; returnUrl?: string }>;
}) {
  const { locale }    = await params;
  const { email = '', returnUrl } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'auth.verifyEmail' });

  const decodedEmail     = decodeURIComponent(email);
  const decodedReturnUrl = returnUrl ? decodeURIComponent(returnUrl) : undefined;

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-full max-w-[420px]">

          {/* Heading */}
          <div className="mb-8 text-center">
            <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-medium tracking-[-0.035em] text-ink mb-2 leading-tight">
              {t('title')}
            </h1>
            {decodedEmail && (
              <p className="text-sm text-mute">
                {t('subtitle', { email: decodedEmail })}
              </p>
            )}
          </div>

          {/* Card */}
          <div className="bg-white border border-rule rounded-[14px] p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
            <OtpForm email={decodedEmail} returnUrl={decodedReturnUrl} />
          </div>

        </div>
      </main>
    </div>
  );
}
