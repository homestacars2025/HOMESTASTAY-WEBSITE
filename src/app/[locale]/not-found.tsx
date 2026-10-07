import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';

/**
 * The website's 404: a way back rather than a dead end. Rendered with the
 * request's locale (the locale layout wraps it), and noindex by nature — Next
 * answers it with a 404 status.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 py-24 flex justify-center">
        <div className="w-full max-w-[460px] text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mute mb-4">404</p>
          <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-medium tracking-[-0.035em] text-ink mb-3 leading-tight">
            {t('title')}
          </h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-8">{t('body')}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-[999px] bg-ink text-white text-sm font-medium px-6 py-3 transition-opacity duration-[240ms] hover:opacity-80"
            >
              {t('home')}
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex min-h-11 items-center justify-center rounded-[999px] border border-rule text-ink text-sm font-medium px-6 py-3 transition-colors duration-[240ms] hover:bg-paper-warm"
            >
              {t('signIn')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
