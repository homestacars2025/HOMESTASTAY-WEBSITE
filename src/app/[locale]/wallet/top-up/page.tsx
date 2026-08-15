import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTlyncConfigured } from '@/lib/payment/tlync';
import { getBookingAccount } from '@/lib/booking/account';
import { isAccountLibyaEligible } from '@/lib/payment/libya-account';
import { usdToLydRate } from '@/lib/payment/lyd-fx';
import { TopupAmountForm } from '@/components/wallet/TopupAmountForm';

/**
 * Step 1 of a top-up: how much, and through which gateway.
 *
 * Nothing here moves money or writes a row — the Server Action does that when
 * the guest continues. The page's whole job is to render the choice.
 *
 * force-dynamic and noindex for the same reasons as /wallet: it is a private,
 * per-session surface, and whether the Libya option appears depends on a live
 * FX rate that can change or go stale at any moment.
 */

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'wallet.topup' });

  return {
    title: `${t('title')} — Homesta Stay`,
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

export default async function TopupPage({ params }: PageProps) {
  const { locale } = await params;
  await requireConfirmedUser(locale, '/wallet/top-up');

  const t = await getTranslations({ locale, namespace: 'wallet.topup' });

  // ── Who sees the dinar option ────────────────────────────────────────────
  // A top-up has no booking, so there is no freshly-typed nationality to read.
  // The account is the source instead: profiles.phone, plus the nationality on
  // any customers row this guest has already created by booking. Without that
  // second lookup a Libyan national on a foreign number would never be offered
  // the only gateway they can actually use.
  const account = await getBookingAccount();
  const libyaEligible = account !== null && (await isAccountLibyaEligible(account));

  // Service-role for reference data only (public.currencies). Not the caller's
  // rows, no user input reaches the read, and nothing from it reaches the
  // client except whether the Libya option renders.
  //
  // The Libya option is offered only when it can actually be priced — offering
  // a payment we cannot quote is worse than offering one fewer.
  const lydRate = isTlyncConfigured() && libyaEligible
    ? await usdToLydRate(createAdminClient())
    : null;

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="mx-auto max-w-2xl px-4 pt-12 pb-24 md:pt-16">
        <Link
          href="/wallet"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-mute transition-opacity duration-[240ms] hover:opacity-70"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:scale-x-[-1]" aria-hidden />
          {t('backToWallet')}
        </Link>

        <h1 className="mt-4 text-[clamp(1.5rem,4vw,2.25rem)] font-medium tracking-[-0.035em] text-ink">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">{t('subtitle')}</p>

        <TopupAmountForm locale={locale} lydAvailable={lydRate !== null} />
      </main>
    </div>
  );
}
