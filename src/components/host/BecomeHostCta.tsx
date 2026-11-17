'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { becomeHost } from '@/app/[locale]/host/become-actions';
import { continueUrl } from '@/lib/auth/continue-url';
import { completeProfilePath } from '@/lib/auth/profile-gap';
import { trackCompleteRegistration, trackLead } from '@/lib/analytics/meta-pixel';
import { HOST_INTENT_COOKIE, HOST_START_PATH } from '@/lib/host/self-serve';

/**
 * The one action on /host: "Become a host".
 *
 *   signed out → sign-up (email method: one email code is the only
 *                verification on this path), back to /host?start=1
 *   customer   → become_host() → CompleteRegistration (a new account) + Lead
 *                → handoff to the portal's add-a-unit wizard (/units/new)
 *   host       → straight to the portal
 *
 * Coming back from sign-up, the flow continues by itself — but only if THIS
 * browser started it (the short-lived intent cookie set on the tap). A link to
 * /host?start=1 sent by someone else does nothing on its own.
 */

type Props = {
  mode: 'signed-out' | 'customer' | 'owner';
  /** Server-checked: ?start=1 AND the intent cookie AND a customer session. */
  autoStart: boolean;
};

function setIntent(on: boolean) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = on
    ? `${HOST_INTENT_COOKIE}=1; Max-Age=3600; Path=/; SameSite=Lax${secure}`
    : `${HOST_INTENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

export function BecomeHostCta({ mode, autoStart }: Props) {
  const t = useTranslations('pages.host.become');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);

  const run = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setBusy(true);
    setError('');
    const r = await becomeHost().catch(() => null);

    if (!r) { started.current = false; setBusy(false); setError(t('error.generic')); return; }
    if (!r.ok) {
      started.current = false;
      if (r.error === 'signed_out') {
        setIntent(true);
        router.push(`/sign-up?method=email&returnUrl=${encodeURIComponent(HOST_START_PATH)}`);
        return;
      }
      if (r.error === 'needs_email') {
        // Name + email + one email code, then back here to finish.
        setIntent(true);
        router.push(completeProfilePath(HOST_START_PATH));
        return;
      }
      setBusy(false);
      setError(t(`error.${r.error === 'not_allowed' ? 'notAllowed' : r.error === 'rate_limited' ? 'rateLimited' : 'generic'}`));
      return;
    }

    setIntent(false);
    if (r.newAccount) trackCompleteRegistration({ source: 'host', eventId: `reg-${r.accountId}` });
    if (r.status === 'became') trackLead({ source: 'host', eventId: `host-${r.accountId}` });
    // A moment for the pixel's beacons before the page is left.
    await new Promise((res) => setTimeout(res, 400));
    window.location.assign(continueUrl(null, locale, r.status === 'became' ? '/units/new' : '/today'));
  }, [locale, router, t]);

  useEffect(() => {
    if (autoStart) void run();
  }, [autoStart, run]);

  const button =
    'inline-flex min-h-12 w-full items-center justify-center rounded-[999px] bg-stay px-8 text-base font-medium text-white transition-opacity duration-[240ms] hover:opacity-90 disabled:opacity-60 sm:w-auto';

  // Resuming after sign-up: a loader, never a button to tap. The button only
  // comes back if something went wrong, with the reason above it.
  if (autoStart && !error) {
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-16 text-center">
        <Loader2 size={28} strokeWidth={1.75} className="animate-spin text-stay" aria-hidden="true" />
        <p className="text-base text-ink">{t('opening')}</p>
      </div>
    );
  }

  if (mode === 'owner') {
    return <a href={continueUrl(null, locale, '/today')} className={button}>{t('ctaOwner')}</a>;
  }

  return (
    <div className="flex flex-col items-stretch gap-3 sm:items-start">
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => {
          if (mode === 'signed-out') {
            setIntent(true);
            router.push(`/sign-up?method=email&returnUrl=${encodeURIComponent(HOST_START_PATH)}`);
            return;
          }
          void run();
        }}
        className={button}
      >
        {busy ? t('working') : t('cta')}
      </button>
      {error && <p role="alert" className="text-sm text-stay">{error}</p>}
    </div>
  );
}
