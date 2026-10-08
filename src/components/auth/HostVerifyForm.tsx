'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CodeStep, type ResendResult, type VerifyResult } from './CodeStep';
import { sendHostCode, verifyHostCode, type SendCodeResult } from '@/app/[locale]/host-verify/actions';

interface HostVerifyFormProps {
  /** a***@gmail.com */
  maskedEmail: string;
  next: string | null;
}

type Phase =
  | { kind: 'sending' }
  | { kind: 'ready'; cooldown: number; note: 'sent' | 'already' }
  | { kind: 'failed'; message: string };

/**
 * Sends the code when the page opens, then takes the six digits.
 *
 * The send is a user-facing action, run once per page load (a ref guards
 * React's double-invoked effects in development). A "wait" answer on that
 * first send means a code went out moments ago — likely a reload — so the
 * screen says so and starts the resend timer at what is left.
 *
 * On success the server has already signed the website session out and hands
 * back the portal URL; this navigates there with a full page load.
 */
export function HostVerifyForm({ maskedEmail, next }: HostVerifyFormProps) {
  const t = useTranslations('auth.hostVerify');
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>({ kind: 'sending' });
  const started = useRef(false);

  function sendError(r: Extract<SendCodeResult, { ok: false }>): string {
    switch (r.error) {
      case 'wait':           return t('wait', { seconds: r.retryAfterSeconds });
      case 'too_many_sends': return t('tooManySends');
      case 'rate_limited':   return t('rateLimited');
      case 'send_failed':    return t('sendFailed');
      case 'signed_out':     return t('signedOut');
      default:               return t('generic');
    }
  }

  async function firstSend() {
    setPhase({ kind: 'sending' });
    const r = await sendHostCode(locale);
    if (r.ok) setPhase({ kind: 'ready', cooldown: 60, note: 'sent' });
    else if (r.error === 'wait') setPhase({ kind: 'ready', cooldown: r.retryAfterSeconds, note: 'already' });
    else setPhase({ kind: 'failed', message: sendError(r) });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void firstSend();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page load, by design
  }, []);

  async function verify(code: string): Promise<VerifyResult> {
    const r = await verifyHostCode(code, locale, next);
    if (r.ok) {
      window.location.assign(r.url);
      return 'ok';
    }
    switch (r.error) {
      case 'invalid':
        return { message: r.attemptsLeft !== null ? t('invalid', { count: r.attemptsLeft }) : t('invalidNoCount') };
      case 'expired':      return { message: t('expired') };
      case 'locked':       return { message: t('locked') };
      case 'rate_limited': return { message: t('rateLimited') };
      case 'malformed':    return 'invalid';
      case 'signed_out':   return { message: t('signedOut') };
      default:             return 'error';
    }
  }

  async function resend(): Promise<ResendResult> {
    const r = await sendHostCode(locale);
    if (r.ok) return true;
    return {
      ok: false,
      message: sendError(r),
      retryAfterSeconds: r.error === 'wait' ? r.retryAfterSeconds : undefined,
    };
  }

  const otherAccount =
    `/api/auth/sign-out?${new URLSearchParams({ locale, returnUrl: `/sign-in?portal=host${next ? `&next=${next}` : ''}` }).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      {phase.kind === 'sending' && (
        <p role="status" className="text-sm text-mute text-center">{t('sending')}</p>
      )}

      {phase.kind === 'failed' && (
        <div className="flex flex-col gap-4">
          <div role="alert" className="bg-stay/5 border border-stay/20 rounded-[8px] px-4 py-3 text-sm text-stay leading-relaxed">
            {phase.message}
          </div>
          <button
            type="button"
            onClick={() => void firstSend()}
            className="w-full min-h-11 rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80"
          >
            {t('retrySend')}
          </button>
        </div>
      )}

      {phase.kind === 'ready' && (
        <>
          <p className="text-sm text-mute text-center leading-relaxed">
            {t.rich(phase.note === 'sent' ? 'sentTo' : 'alreadySent', {
              email: maskedEmail,
              b: (chunks) => <span dir="ltr" className="text-ink font-medium">{chunks}</span>,
            })}
          </p>
          <CodeStep
            onVerify={verify}
            onResend={resend}
            initialCooldown={phase.cooldown}
            submitLabel={t('submit')}
          />
        </>
      )}

      <a
        href={otherAccount}
        className="inline-flex min-h-11 items-center justify-center text-sm text-mute hover:text-ink transition-colors duration-[240ms]"
      >
        {t('otherAccount')}
      </a>
    </div>
  );
}
