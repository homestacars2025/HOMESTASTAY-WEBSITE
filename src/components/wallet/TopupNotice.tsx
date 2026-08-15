import { getTranslations } from 'next-intl/server';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

/**
 * The banner a guest lands on when they come back from a gateway.
 *
 * THREE STATES, AND THE MIDDLE ONE IS THE IMPORTANT ONE.
 *   success — the wallet was credited, confirmed against the gateway.
 *   failed  — nothing was charged, confirmed. Safe to try again.
 *   pending — WE DO NOT KNOW. The provision call died, the receipt endpoint
 *             was unreachable, or the credit could not be written. Telling
 *             this guest "failed" invites a second payment on a card that may
 *             already have been charged; telling them "success" is a lie about
 *             their own money. The copy says we are checking and asks them not
 *             to pay again, which is exactly true — the reconcile sweep
 *             settles it.
 *
 * Renders nothing for an unknown or absent value, so a stray query parameter
 * cannot put an arbitrary banner on the page.
 */

interface TopupNoticeProps {
  locale: string;
  topup: string | undefined;
}

export async function TopupNotice({ locale, topup }: TopupNoticeProps) {
  if (topup !== 'success' && topup !== 'failed' && topup !== 'pending') return null;

  const t = await getTranslations({ locale, namespace: 'wallet.notice' });

  const tone = {
    success: {
      icon: <CheckCircle2 className="h-[18px] w-[18px] text-credit" aria-hidden />,
      className: 'border-credit/25 bg-credit/5',
    },
    pending: {
      icon: <Clock className="h-[18px] w-[18px] text-mute" aria-hidden />,
      className: 'border-rule bg-paper-warm',
    },
    failed: {
      icon: <XCircle className="h-[18px] w-[18px] text-debit" aria-hidden />,
      className: 'border-debit/25 bg-debit/5',
    },
  }[topup];

  return (
    <div
      role="status"
      className={`mt-6 flex items-start gap-3 rounded-[14px] border p-4 ${tone.className}`}
    >
      <span className="mt-[2px] shrink-0">{tone.icon}</span>
      <span className="flex flex-col gap-1">
        <span className="text-[14px] font-medium leading-snug text-ink">
          {t(`${topup}.title` as 'success.title')}
        </span>
        <span className="text-[13px] leading-relaxed text-ink-soft">
          {t(`${topup}.body` as 'success.body')}
        </span>
      </span>
    </div>
  );
}
