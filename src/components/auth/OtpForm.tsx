'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { continueUrl } from '@/lib/auth/continue-url';
import { createClient } from '@/lib/supabase/client';
import { syncProfileFromAuth } from '@/lib/auth/sync-profile';
import { completeProfilePath, safeReturnPath } from '@/lib/auth/profile-gap';
import { CodeStep, verifyResultFrom, type VerifyResult } from './CodeStep';

interface OtpFormProps {
  email: string;
  returnUrl?: string;
  /** Host portal page, when the sign-in started from the portal. */
  next?: string | null;
}

/**
 * The email-confirmation code after email sign-up (flow B), and for a
 * returning guest whose address was never confirmed (SignInForm sends them
 * here on email_not_confirmed).
 *
 * The "Confirm sign up" template sends a 6-digit {{ .Token }}, verified with
 * type 'email'. Next is /complete-profile for the mandatory phone step — or
 * straight to returnUrl when the account already has a verified phone.
 */
export function OtpForm({ email, returnUrl, next = null }: OtpFormProps) {
  const t      = useTranslations('auth.verifyEmail');
  const router = useRouter();
  const locale = useLocale();

  async function verify(code: string): Promise<VerifyResult> {
    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    const outcome = verifyResultFrom(error, Boolean(data.session && data.user));
    if (outcome !== 'ok') return outcome;

    // Names typed on the sign-up form, kept in this tab until now. Only ever
    // fills empty columns (see syncProfileFromAuth), so a stale entry from an
    // earlier attempt cannot overwrite anything.
    let pending: { first_name?: string | null; last_name?: string | null } = {};
    try {
      pending = JSON.parse(sessionStorage.getItem('pending_profile') ?? '{}');
    } catch { /* a corrupt entry costs the prefill, nothing else */ }

    const result = await syncProfileFromAuth({
      firstName: pending.first_name ?? undefined,
      lastName:  pending.last_name  ?? undefined,
    }).catch(() => null);
    try { sessionStorage.removeItem('pending_profile'); } catch { /* storage blocked */ }

    const back = safeReturnPath(returnUrl);
    if (!result || result.gap.name) {
      // Still missing the phone (or a name): /complete-profile, which is for
      // guests only and sends any other account through /api/auth/continue.
      router.push(completeProfilePath(back));
      router.refresh();
    } else {
      // The common exit, with a full page load — see SignInForm.
      window.location.assign(continueUrl(back || null, locale, next));
    }
    return 'ok';
  }

  async function resend(): Promise<boolean> {
    const { error } = await createClient().auth.resend({ type: 'signup', email });
    return !error;
  }

  if (!email) {
    return (
      <div className="text-center py-4 flex flex-col gap-4">
        <p className="text-sm text-mute">{t('noEmail')}</p>
        <Link
          href="/sign-up"
          className="text-sm text-ink font-medium underline underline-offset-2 hover:opacity-70 transition-opacity duration-[240ms]"
        >
          {t('backToSignUp')}
        </Link>
      </div>
    );
  }

  // initialCooldown 0: a guest sent here from sign-in was NOT just sent a
  // code, and must be able to ask for one straight away.
  return <CodeStep onVerify={verify} onResend={resend} initialCooldown={0} submitLabel={t('submit')} />;
}
