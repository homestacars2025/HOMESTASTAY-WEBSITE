import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CheckCircle, Clock, Info, XCircle } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { TransferSummary } from '@/components/transfers/TransferSummary';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTransfer, getTransferOptions } from '@/lib/transfers/server';
import { appTransferReturnUrl } from '@/lib/transfers/pay-session';
import { PAID_STATES, UUID_RE, type TransferView } from '@/lib/transfers/model';

/**
 * After a transfer payment: received / failed (retry) / still confirming /
 * charged-but-refunding. ?r= is only a hint from the callback — when the
 * visitor's session can read the transfer, ITS status decides what is said
 * (a hand-typed "?r=success" on an unpaid transfer reads "confirming").
 * Opened from the app (?app=1), it also offers the way back into the app.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ locale: string; transferId: string }>;
  searchParams: Promise<{ r?: string; reason?: string; app?: string }>;
};

type State = 'success' | 'failed' | 'pending' | 'refund';

export default async function TransferPayDonePage({ params, searchParams }: Props) {
  const { locale, transferId } = await params;
  const { r, app } = await searchParams;
  if (!UUID_RE.test(transferId)) notFound();
  const t = await getTranslations({ locale, namespace: 'transfers.done' });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const transfer: TransferView | null = user ? await getTransfer(supabase, transferId) : null;

  let state: State = r === 'success' || r === 'failed' || r === 'refund' ? r : 'pending';
  if (transfer) {
    if (PAID_STATES.has(transfer.status)) state = 'success';
    else if (state === 'success') state = 'pending';
  }

  const options = transfer ? await getTransferOptions().catch(() => null) : null;
  const fromApp = app === '1';
  const deepLink = fromApp ? appTransferReturnUrl(transferId, state) : null;
  const Icon = state === 'success' ? CheckCircle : state === 'failed' ? XCircle : state === 'refund' ? Info : Clock;

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-xl px-4 pt-24 pb-20">
        <div role="status" className="mb-8 flex flex-col items-center gap-4 text-center">
          <Icon size={44} strokeWidth={1.5} className={state === 'failed' ? 'text-ink-soft' : 'text-stay'} aria-hidden="true" />
          <h1 className="text-[clamp(1.5rem,5vw,2rem)] font-medium leading-tight tracking-[-0.03em] text-ink">{t(`${state}.title`)}</h1>
          <p className="max-w-md text-ink-soft">{t(`${state}.body`)}</p>
          {transfer?.reference && <p className="font-mono text-xs uppercase tracking-[0.1em] text-mute">{t('reference', { ref: transfer.reference })}</p>}
        </div>

        {transfer && <TransferSummary transfer={transfer} options={options} locale={locale} />}

        <div className="mt-8 flex flex-col gap-3">
          {deepLink && (
            <a href={deepLink} className="inline-flex min-h-12 items-center justify-center rounded-[999px] bg-stay px-8 font-medium text-white">
              {t('backToApp')}
            </a>
          )}
          {state === 'failed' && (
            <Link
              href={`/transfers/pay/${transferId}`}
              className={`inline-flex min-h-12 items-center justify-center rounded-[999px] px-8 font-medium ${deepLink ? 'border border-rule text-ink' : 'bg-stay text-white'}`}
            >
              {t('retry')}
            </Link>
          )}
          {!fromApp && (
            <Link href="/account/transfers" className="inline-flex min-h-12 items-center justify-center rounded-[999px] border border-rule px-8 font-medium text-ink">
              {t('myTransfers')}
            </Link>
          )}
          {(state === 'pending' || state === 'refund') && (
            <Link href="/contact" className="text-center text-sm text-ink-soft underline underline-offset-4">{t('contact')}</Link>
          )}
        </div>
      </main>
    </div>
  );
}
