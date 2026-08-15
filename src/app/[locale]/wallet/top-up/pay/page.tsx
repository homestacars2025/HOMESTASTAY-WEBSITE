import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadOwnedIntent } from '@/lib/wallet/topup';
import { TopupCardForm } from '@/components/wallet/TopupCardForm';
import { TopupLydForm } from '@/components/wallet/TopupLydForm';
import { walletMoney } from '@/lib/wallet/format';

/**
 * Step 2 of a top-up: pay the intent.
 *
 * AUTHORISATION: the intent id is in the URL, which is fine precisely because
 * it is not a credential — loadOwnedIntent re-reads the row and checks
 * profile_id against the session, and 404s on any mismatch. An unauthorised
 * visitor must not even learn whether an intent id exists, which is why this
 * is notFound() rather than a message.
 *
 * A PAYABLE INTENT ONLY. 'pending' is the one status a payment may start from.
 * Anything else — already processing at the gateway, already paid, expired,
 * cancelled — means starting a second payment would risk charging twice for
 * one intent, so the page refuses and sends the guest back to the wallet.
 */

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ intent?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'wallet.topup' });

  return {
    title: `${t('payTitle')} — Homesta Stay`,
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

export default async function TopupPayPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { intent: intentId } = await searchParams;

  const user = await requireConfirmedUser(locale, '/wallet');
  if (!intentId) notFound();

  const t = await getTranslations({ locale, namespace: 'wallet.topup' });
  const admin = createAdminClient();

  const intent = await loadOwnedIntent(admin, intentId, user.id);
  if (!intent) notFound();

  if (intent.status !== 'pending') {
    return (
      <div className="min-h-screen bg-paper">
        <Header />
        <main className="mx-auto max-w-2xl px-4 pt-16 pb-24">
          <div className="flex flex-col items-center gap-3 rounded-[14px] border border-rule px-6 py-14 text-center">
            <p className="text-base font-medium text-ink">{t('notPayableTitle')}</p>
            <p className="max-w-xs text-sm leading-relaxed text-mute">
              {t('notPayableSubtitle')}
            </p>
            <Link
              href="/wallet"
              className="mt-2 inline-flex min-h-[44px] items-center rounded-[999px] bg-ink px-6 text-sm font-medium text-white transition-opacity duration-[240ms] hover:opacity-80"
            >
              {t('backToWallet')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // The gateway and the local figure were both fixed when the intent was
  // written. They are read back, never recomputed: a rate re-read now could
  // differ from the one recorded, and the guest agreed to the recorded one.
  const gateway = intent.gateway === 'tlync' ? 'tlync' : 'kuveyt';
  const currencyCode = intent.currencyCode ?? (gateway === 'tlync' ? 'LYD' : 'TRY');

  if (intent.amountMinor === null || intent.fxRate === null) {
    console.error('[wallet/topup/pay] intent has no local amount or rate', {
      intentId, gateway,
    });
    notFound();
  }

  const intlLocale = locale === 'en' ? 'en-GB' : locale;
  const localeMoney = (currency: string) =>
    new Intl.NumberFormat(intlLocale, {
      style: 'currency', currency, maximumFractionDigits: 2,
    });

  const amountLabel = localeMoney(currencyCode).format(intent.amountMinor);
  const usdLabel = walletMoney(locale).format(intent.amountUsd);
  const rateLabel = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 4,
  }).format(intent.fxRate);

  // profiles, not customers: a top-up has no booking, so the phone the gateway
  // needs comes from the account. Empty is survivable — the form asks for it.
  const { data: profile } = await admin
    .from('profiles')
    .select('phone')
    .eq('id', user.id)
    .maybeSingle();

  const phone = (profile?.phone as string | null) ?? '';

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="mx-auto max-w-2xl px-4 pt-12 pb-24 md:pt-16">
        <Link
          href="/wallet/top-up"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-mute transition-opacity duration-[240ms] hover:opacity-70"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:scale-x-[-1]" aria-hidden />
          {t('changeAmount')}
        </Link>

        <h1 className="mt-4 mb-8 text-[clamp(1.5rem,4vw,2.25rem)] font-medium tracking-[-0.035em] text-ink">
          {t('payTitle')}
        </h1>

        {gateway === 'tlync' ? (
          <TopupLydForm
            locale={locale}
            intentId={intent.id}
            amountLabel={amountLabel}
            usdLabel={usdLabel}
            rateLabel={rateLabel}
            phone={phone}
          />
        ) : (
          <TopupCardForm
            locale={locale}
            intentId={intent.id}
            amountLabel={amountLabel}
            usdLabel={usdLabel}
            rateLabel={rateLabel}
            phone={phone}
          />
        )}
      </main>
    </div>
  );
}
