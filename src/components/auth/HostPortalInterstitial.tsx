import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HOST_DEFAULT_NEXT, type HostNextPath } from '@/lib/auth/portals';

/**
 * A guest session arriving with ?portal=host — someone typed
 * host.homestastay.com while signed in to the website as a guest.
 *
 * Not the application form: they may well HAVE a host account and simply be
 * signed in with the wrong one. So they are told which account this is and
 * offered both ways forward. "Sign out and sign in as host" goes through
 * /api/auth/sign-out (a full page load, scope 'local') and comes back to this
 * same page with portal=host and next intact, now showing the sign-in form.
 */
export async function HostPortalInterstitial({
  locale,
  who,
  next,
}: {
  locale: string;
  /** Name, else email, of the signed-in guest account. */
  who: string;
  next: HostNextPath | null;
}) {
  const t = await getTranslations({ locale, namespace: 'auth.hostInterstitial' });

  const back = new URLSearchParams({ portal: 'host', next: next ?? HOST_DEFAULT_NEXT });
  const signOutHref =
    `/api/auth/sign-out?${new URLSearchParams({ locale, returnUrl: `/sign-in?${back.toString()}` }).toString()}`;

  return (
    <div className="flex flex-col gap-5 text-center">
      <p className="text-sm text-ink-soft leading-relaxed">
        {t.rich('body', {
          who,
          b: (chunks) => <span dir="auto" className="font-medium text-ink break-all">{chunks}</span>,
        })}
      </p>
      <a
        href={signOutHref}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[999px] bg-ink text-white text-sm font-medium px-6 py-3 transition-opacity duration-[240ms] hover:opacity-80"
      >
        {t('signOutAndSwitch')}
      </a>
      <Link
        href="/host"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[999px] border border-rule text-ink text-sm font-medium px-6 py-3 transition-colors duration-[240ms] hover:bg-paper-warm"
      >
        {t('becomeHost')}
      </Link>
      <Link href="/" className="inline-flex min-h-11 items-center justify-center text-sm text-mute hover:text-ink transition-colors duration-[240ms]">
        {t('back')}
      </Link>
    </div>
  );
}
