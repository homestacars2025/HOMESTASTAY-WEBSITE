import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Car, MessageCircle } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { TransferSummary } from '@/components/transfers/TransferSummary';
import { CancelTransfer } from '@/components/transfers/CancelTransfer';
import { Link } from '@/i18n/navigation';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';
import { getTransfer, getTransferOptions } from '@/lib/transfers/server';
import { AWAITING_PAYMENT, UUID_RE, formatIstanbul, statusKey } from '@/lib/transfers/model';

/** One of my transfers — transfer_get as the user (driver and car once assigned), pay or cancel. */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MyTransferPage({ params }: { params: Promise<{ locale: string; transferId: string }> }) {
  const { locale, transferId } = await params;
  if (!UUID_RE.test(transferId)) notFound();
  await requireConfirmedUser(locale, `/account/transfers/${transferId}`);
  const supabase = await createClient();
  const [t, tStatus, transfer, options] = await Promise.all([
    getTranslations({ locale, namespace: 'transfers.account' }),
    getTranslations({ locale, namespace: 'transfers.status' }),
    getTransfer(supabase, transferId),
    getTransferOptions().catch(() => null),
  ]);
  if (!transfer) notFound();

  const status = statusKey(transfer.status);
  const freeNow = transfer.freeCancelUntil ? new Date(transfer.freeCancelUntil).getTime() > Date.now() : true;
  const wa = transfer.driver?.whatsapp?.replace(/\D/g, '');

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-xl px-4 pt-24 pb-20">
        <Link href="/account/transfers" className="mb-4 inline-block text-sm text-ink-soft underline underline-offset-4">{t('title')}</Link>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-mute rtl:font-sans rtl:tracking-normal">
          {transfer.reference ?? ''}
        </p>
        <h1 className="mb-6 text-[clamp(1.5rem,5vw,2rem)] font-medium tracking-[-0.03em] text-ink">
          {tStatus.has(status) ? tStatus(status) : transfer.status}
        </h1>

        <TransferSummary transfer={transfer} options={options} locale={locale} />

        {(transfer.driver || transfer.vehicle) && (
          <section className="mt-4 rounded-[14px] border border-rule bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 font-medium text-ink"><Car size={18} strokeWidth={1.75} aria-hidden="true" />{t('driver')}</h2>
            {transfer.driver?.name && <p className="text-ink">{transfer.driver.name}</p>}
            {transfer.vehicle && (
              <p className="text-sm text-ink-soft">
                {[transfer.vehicle.model, transfer.vehicle.color, transfer.vehicle.plate].filter(Boolean).join(' · ')}
              </p>
            )}
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[999px] border border-rule px-5 text-sm font-medium text-ink">
                <MessageCircle size={16} aria-hidden="true" />{t('whatsappDriver')}
              </a>
            )}
          </section>
        )}

        {AWAITING_PAYMENT.has(transfer.status) && transfer.canPay && (
          <div className="mt-6">
            <Link href={`/transfers/pay/${transfer.id}`} className="inline-flex min-h-12 w-full items-center justify-center rounded-[999px] bg-stay px-8 font-medium text-white">
              {t('payNow')}
            </Link>
            {transfer.paymentExpiresAt && <p className="mt-2 text-center text-sm text-mute">{t('payBy', { time: formatIstanbul(transfer.paymentExpiresAt, locale) })}</p>}
          </div>
        )}

        {transfer.canCancel && <CancelTransfer transferId={transfer.id} free={freeNow} />}
      </main>
    </div>
  );
}
