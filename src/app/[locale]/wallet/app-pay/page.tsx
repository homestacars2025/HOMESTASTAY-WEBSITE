import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { createAdminClient } from '@/lib/supabase/admin';
import { readPayToken } from '@/lib/app/pay-token';
import { loadOwnedIntent } from '@/lib/wallet/topup';
import { TopupCardForm } from '@/components/wallet/TopupCardForm';
import { walletMoney } from '@/lib/wallet/format';

/**
 * The card page the MOBILE APP opens in the system browser.
 *
 * ⚠️ NO SESSION REACHES THIS PAGE, AND THAT IS THE POINT. The app holds a
 * Supabase token; the system browser it launches is a separate cookie jar with
 * nothing of ours in it. So this page cannot call requireConfirmedUser the way
 * /wallet/top-up/pay does — it is authorised by the signed capability in `?t`,
 * minted by /api/app/wallet/topup/start after that caller was authenticated by
 * their bearer token. See lib/app/pay-token.ts.
 *
 * The token binds BOTH the intent and the profile, and the intent is re-read
 * and re-checked against that profile below, so a token cannot be pointed at
 * somebody else's top-up.
 *
 * ⚠️ CARD DATA LIVES ONLY HERE, never in the app process. That is the whole
 * reason this page exists rather than a native form: it keeps the app out of
 * PCI scope, and it runs 3D Secure in a real browser, which is what card
 * issuers are least likely to refuse.
 *
 * The website's own top-up flow is untouched — this is a second door onto the
 * same form component, not a change to the first.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function AppPayPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { t: rawToken } = await searchParams;

  // Absent, malformed, expired or tampered are one outcome. An unauthorised
  // visitor must not learn whether an intent exists.
  const claims = readPayToken(rawToken);
  if (!claims) notFound();

  const admin = createAdminClient();
  const intent = await loadOwnedIntent(admin, claims.intentId, claims.profileId);
  if (!intent) notFound();

  const t = await getTranslations({ locale, namespace: 'wallet.topup' });

  // 'pending' is the only status a payment may start from. Anything else means
  // a gateway already has this intent, or it is finished — starting a second
  // payment is how one intent gets charged twice.
  if (intent.status !== 'pending') {
    return (
      <Shell>
        <Notice title={t('notPayableTitle')} body={t('notPayableSubtitle')} />
      </Shell>
    );
  }

  if (intent.amountMinor === null || intent.fxRate === null) {
    console.error('[app-pay] intent has no local amount or rate', {
      intentId: intent.id,
    });
    notFound();
  }

  const intlLocale = locale === 'en' ? 'en-GB' : locale;
  const currencyCode = intent.currencyCode ?? 'TRY';

  const amountLabel = new Intl.NumberFormat(intlLocale, {
    style: 'currency', currency: currencyCode, maximumFractionDigits: 2,
  }).format(intent.amountMinor);
  const usdLabel = walletMoney(locale).format(intent.amountUsd);
  const rateLabel = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 4,
  }).format(intent.fxRate);

  // profiles, not customers: a top-up has no booking. Empty is survivable —
  // the form asks for it.
  const { data: profile } = await admin
    .from('profiles')
    .select('phone')
    .eq('id', claims.profileId)
    .maybeSingle();

  return (
    <Shell>
      <h1 className="mb-8 text-[clamp(1.5rem,4vw,2.25rem)] font-medium tracking-[-0.035em] text-ink">
        {t('payTitle')}
      </h1>

      {/* The token rides as a hidden field so the POST is authorised the same
          way this GET was. It is NOT re-read from the URL there: a form action
          has no query string of its own. */}
      <TopupCardForm
        locale={locale}
        intentId={intent.id}
        amountLabel={amountLabel}
        usdLabel={usdLabel}
        rateLabel={rateLabel}
        phone={(profile?.phone as string | null) ?? ''}
        action="/api/app/wallet/topup/pay"
        hiddenFields={{ t: rawToken as string }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-2xl px-4 pt-12 pb-24 md:pt-16">{children}</main>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-rule px-6 py-14 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      <p className="max-w-xs text-sm leading-relaxed text-mute">{body}</p>
    </div>
  );
}
