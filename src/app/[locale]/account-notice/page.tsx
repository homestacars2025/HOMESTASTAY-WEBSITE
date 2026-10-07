import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { ADMIN_PORTAL_URL, HOST_PORTAL_ORIGIN, TEAM_PORTAL_URL } from '@/lib/auth/portals';

/**
 * Where /api/auth/continue sends an account that does not belong on the guest
 * site. The session has already been signed out (locally) by the time this
 * renders; this page only says why, and where to go instead.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Reason = 'team' | 'admin' | 'blocked' | 'host';
const REASONS: readonly Reason[] = ['team', 'admin', 'blocked', 'host'];

const DESTINATION: Record<Reason, { href: string; label: string } | null> = {
  team:    { href: TEAM_PORTAL_URL,  label: 'team.homestastay.com' },
  admin:   { href: ADMIN_PORTAL_URL, label: 'admin.homestastay.com' },
  host:    { href: HOST_PORTAL_ORIGIN, label: 'host.homestastay.com' },
  blocked: null,
};

export default async function AccountNoticePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  const { reason: raw } = await searchParams;
  const reason: Reason = REASONS.includes(raw as Reason) ? (raw as Reason) : 'blocked';
  const t = await getTranslations({ locale, namespace: 'auth.accountNotice' });
  const destination = DESTINATION[reason];

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-full max-w-[460px] bg-white border border-rule rounded-[14px] p-6 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.06)] text-center">
          <h1 className="text-[clamp(1.35rem,4vw,1.75rem)] font-medium tracking-[-0.035em] text-ink mb-3 leading-tight">
            {t(`${reason}.title`)}
          </h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-6">
            {destination
              ? t.rich(`${reason}.body`, {
                  site: destination.label,
                  b: (chunks) => <span dir="ltr" className="font-medium text-ink">{chunks}</span>,
                })
              : t(`${reason}.body`)}
          </p>

          {destination && (
            <a
              href={destination.href}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-[999px] bg-ink text-white text-sm font-medium px-6 py-3 transition-opacity duration-[240ms] hover:opacity-80"
            >
              {t('goTo', { site: destination.label })}
            </a>
          )}

          <Link
            href="/"
            className="mt-4 inline-flex min-h-11 items-center text-sm text-mute hover:text-ink transition-colors duration-[240ms]"
          >
            {t('backHome')}
          </Link>
        </div>
      </main>
    </div>
  );
}
