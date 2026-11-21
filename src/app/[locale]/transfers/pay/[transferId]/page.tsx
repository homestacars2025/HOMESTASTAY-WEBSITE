import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { TopupCardForm } from '@/components/wallet/TopupCardForm';
import { TransferSummary } from '@/components/transfers/TransferSummary';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { Link } from '@/i18n/navigation';
import {
  PAYABLE_ATTEMPT, getTransfer, getTransferOptions, initTransferPayment, readPaymentAttempt,
} from '@/lib/transfers/server';
import {
  mintAttemptToken, ownsTransfer, readAppTransferToken, readAttemptToken,
} from '@/lib/transfers/pay-session';
import {
  AWAITING_PAYMENT, PAID_STATES, UUID_RE, formatIstanbul, formatMoney, parseTransfer, type TransferView,
} from '@/lib/transfers/model';

/**
 * /[locale]/transfers/pay/[transferId] — pay a transfer, from the website or
 * the app (the URL the app opens: HOMESTA-APP transferPayUrl).
 *
 *   who      the website session (cookie); or, from the app (the phone's
 *            browser has no website session — the wallet top-up answer):
 *              ?a=  the attempt /api/app/transfers/pay/start opened (30 min),
 *              ?t=  the 15-minute pay token from /api/app/transfers/pay-link.
 *            Neither → sign in, and back here.
 *   amount   transfer_payments, written by transfer_payment_init (service
 *            role, after the ownership check): the TRY figure shown and charged
 *            is the database's. ?a= reuses its attempt while still payable;
 *            otherwise every view opens a fresh one, so the reload after a
 *            failure IS the retry.
 *   states   paid → the success page; expired / cancelled → "book again".
 *
 * Card data goes straight to /api/payment/transfer/start, the same 3-D Secure
 * path as stays and top-ups (lib/payment/kuveyt-turk).
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ locale: string; transferId: string }>;
  searchParams: Promise<{ t?: string; a?: string; error?: string }>;
};

const ERRORS = new Set(['declined', 'card', 'contact', 'bank', 'session', 'server', 'unknown', 'expired']);

export default async function TransferPayPage({ params, searchParams }: Props) {
  const { locale, transferId } = await params;
  const { t: token, a: attemptIn, error } = await searchParams;
  if (!UUID_RE.test(transferId)) notFound();

  const t = await getTranslations({ locale, namespace: 'transfers.pay' });
  const admin = createAdminClient();
  const path = `/transfers/pay/${transferId}`;

  // ── Who is paying ─────────────────────────────────────────────────────────
  let profileId: string;
  let transfer: TransferView | null;
  let phone = '';
  const tokenClaims = readAppTransferToken(token);
  const viaToken = tokenClaims && tokenClaims.transferId === transferId ? tokenClaims : null;
  const attemptClaims = readAttemptToken(attemptIn);
  const viaAttempt = attemptClaims && attemptClaims.app && attemptClaims.transferId === transferId ? attemptClaims : null;
  const appProfile = viaAttempt?.profileId ?? viaToken?.profileId ?? null;
  const fromApp = Boolean(appProfile);

  if (appProfile) {
    if (!(await ownsTransfer(admin, transferId, appProfile))) notFound();
    profileId = appProfile;
    transfer = (await getTransfer(admin, transferId)) ?? (await readTransferRow(admin, transferId));
  } else {
    const user = await requireConfirmedUser(locale, path);
    profileId = user.id;
    const supabase = await createClient();
    transfer = await getTransfer(supabase, transferId);
    const { data: profile } = await supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle();
    phone = typeof profile?.phone === 'string' ? profile.phone : '';
  }
  if (!transfer) notFound();

  const done = `/transfers/pay/${transferId}/done?r=success${fromApp ? '&app=1' : ''}`;
  if (PAID_STATES.has(transfer.status)) redirect(`/${locale}${done}`);
  if (!AWAITING_PAYMENT.has(transfer.status)) return <Expired locale={locale} />;

  // ── The attempt — the amount comes from here, and only here ──────────────
  // The app's attempt while the bank can still take it; otherwise a fresh one.
  let attempt: Awaited<ReturnType<typeof initTransferPayment>> | null = null;
  let attemptToken: string | null = null;
  if (viaAttempt && attemptIn) {
    const row = await readPaymentAttempt(admin, viaAttempt.merchantOrderId);
    // A card attempt only — a TLYNC attempt is never re-priced into a card form.
    if (row && row.gateway !== 'tlync' && PAYABLE_ATTEMPT.has(row.status) && row.amountTry && row.amountTry > 0) {
      attempt = { status: 'ok', merchantOrderId: row.merchantOrderId, amountTry: row.amountTry, amountLyd: null, amountUsd: row.amountUsd, reference: null };
      attemptToken = attemptIn;
    }
  }
  attempt ??= await initTransferPayment(admin, transferId);
  if (attempt.status === 'not_payable') {
    if (attempt.transferStatus && PAID_STATES.has(attempt.transferStatus)) redirect(`/${locale}${done}`);
    return <Expired locale={locale} />;
  }
  if (attempt.status === 'expired') return <Expired locale={locale} />;
  if (attempt.status !== 'ok') {
    if (attempt.status === 'not_found' || attempt.status === 'forbidden') notFound();
    throw new Error('transfer_payment_init');
  }

  const options = await getTransferOptions().catch(() => null);
  if (attempt.amountTry === null) throw new Error('transfer_payment_init: no TRY amount');
  const amountTry = attempt.amountTry;
  const usd = attempt.amountUsd ?? transfer.priceUsd;
  const amountLabel = formatMoney(amountTry, 'TRY', locale);
  const usdLabel = formatMoney(usd, 'USD', locale);
  const rateLabel = usd ? formatMoney(amountTry / usd, 'TRY', locale) : '';
  const freeHours = options?.freeCancelHours ?? 24;

  attemptToken ??= mintAttemptToken({
    transferId, merchantOrderId: attempt.merchantOrderId, profileId, app: fromApp, returnUrl: viaAttempt?.returnUrl ?? null,
  });

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-xl px-4 pt-24 pb-20">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-mute rtl:font-sans rtl:tracking-normal">
          {t('eyebrow')}{attempt.reference ?? transfer.reference ? ` · ${attempt.reference ?? transfer.reference}` : ''}
        </p>
        <h1 className="mb-6 text-[clamp(1.6rem,5vw,2.1rem)] font-medium leading-tight tracking-[-0.035em] text-ink">{t('title')}</h1>

        {error && ERRORS.has(error) && (
          <div role="alert" className="mb-6 rounded-[14px] border border-stay/30 bg-stay/5 p-4 text-sm text-ink">
            <p className="font-medium">{t('failedTitle')}</p>
            <p className="mt-1 text-ink-soft">{t(`errors.${error}`)}</p>
          </div>
        )}

        <TransferSummary transfer={transfer} options={options} locale={locale} />

        <ul className="mt-5 mb-8 flex flex-col gap-1.5 text-sm text-ink-soft">
          <li>{t('fullPayment')}</li>
          <li>{t('freeCancel', { hours: freeHours })}</li>
          {transfer.paymentExpiresAt && <li className="text-mute">{t('holdUntil', { time: formatIstanbul(transfer.paymentExpiresAt, locale) })}</li>}
        </ul>

        <TopupCardForm
          locale={locale}
          intentId={transferId}
          amountLabel={amountLabel}
          usdLabel={usdLabel}
          rateLabel={rateLabel}
          phone={phone}
          action="/api/payment/transfer/start"
          hiddenFields={{ attempt: attemptToken, ...(viaToken && token ? { t: token } : {}) }}
        />
      </main>
    </div>
  );
}

async function Expired({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'transfers.pay' });
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-xl px-4 pt-32 pb-20 text-center">
        <h1 className="mb-3 text-2xl font-medium tracking-[-0.03em] text-ink">{t('expiredTitle')}</h1>
        <p className="mb-8 text-ink-soft">{t('expiredBody')}</p>
        <Link href="/transfers" className="inline-flex min-h-12 items-center rounded-[999px] bg-stay px-8 font-medium text-white">
          {t('bookAgain')}
        </Link>
      </main>
    </div>
  );
}

/**
 * The app path's fallback view when transfer_get does not answer the service
 * role: the booking row itself (ownership already checked). Missing fields
 * are simply not shown.
 */
async function readTransferRow(admin: ReturnType<typeof createAdminClient>, transferId: string): Promise<TransferView | null> {
  const { data, error } = await admin.from('transfer_bookings').select('*').eq('id', transferId).maybeSingle();
  if (error) {
    console.error('[transfers/pay] booking row unreadable', { code: error.code, message: error.message });
    return null;
  }
  return parseTransfer(data);
}
