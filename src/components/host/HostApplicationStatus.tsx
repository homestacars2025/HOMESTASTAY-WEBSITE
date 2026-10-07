import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle, Clock, Info } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { continueUrl } from '@/lib/auth/continue-url';

export type HostApplicationState = 'under_review' | 'approved' | 'declined';

/**
 * Where a host application stands, from my_host_application(). Shared by the
 * /host page (server) and the form right after submitting (client).
 *
 * "Approved" opens the portal through /api/auth/continue — a full page load,
 * since that route hands the account off with a one-time token. The approval
 * turned THIS account into an owner, so no second sign-up is involved.
 */
export function HostApplicationStatus({ state }: { state: HostApplicationState }) {
  const t = useTranslations('pages.host.status');
  const locale = useLocale();

  const Icon = state === 'approved' ? CheckCircle : state === 'declined' ? Info : Clock;

  return (
    <div role="status" className="flex flex-col items-center text-center gap-5 py-10">
      <Icon size={44} strokeWidth={1.5} className={state === 'declined' ? 'text-ink-soft' : 'text-stay'} aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-medium tracking-[-0.025em] text-ink">{t(`${state}.title`)}</h2>
        <p className="text-sm text-ink-soft leading-relaxed max-w-sm">{t(`${state}.body`)}</p>
      </div>

      {state === 'approved' && (
        <a
          href={continueUrl(null, locale, '/units')}
          className="inline-flex min-h-11 items-center rounded-[999px] bg-stay text-white text-sm font-medium px-6 py-2.5 transition-opacity duration-[240ms] hover:opacity-90"
        >
          {t('approved.cta')}
        </a>
      )}
      {state === 'declined' && (
        <Link
          href="/contact"
          className="inline-flex min-h-11 items-center rounded-[999px] border border-rule text-ink text-sm font-medium px-6 py-2.5 transition-colors duration-[240ms] hover:bg-paper-warm"
        >
          {t('declined.cta')}
        </Link>
      )}
    </div>
  );
}
