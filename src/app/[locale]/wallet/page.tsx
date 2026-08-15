import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { getWalletView } from '@/lib/queries/wallet';
import { WalletBalanceCard } from '@/components/wallet/WalletBalanceCard';
import { WalletEntryList } from '@/components/wallet/WalletEntryList';
import { TopupNotice } from '@/components/wallet/TopupNotice';

/**
 * The customer wallet — balance and statement.
 *
 * ⚠️ NEVER CACHED. A balance is the one figure on this site that is wrong the
 * instant it is stale: a guest who tops up and sees the old number assumes
 * their money vanished. force-dynamic is therefore load-bearing, not a
 * default, and it is also why this page reads through server.ts rather than
 * the cached public client every listing surface uses.
 *
 * PRIVATE, SO NOINDEX. Law 3 wants everything public discoverable; the
 * inverse duty applies here. Same posture as the booking result page.
 *
 * DISPLAY SURFACE ONLY. No top-up, no charge, no adjustment — those RPCs are
 * not called anywhere in this repo. Cashback and adjustment are HP-ADMIN's
 * business (CLAUDE.md §4), and a top-up flow is a later phase.
 */

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: string }>;
  /** `topup` is set by the gateway paths on the way back. */
  searchParams: Promise<{ topup?: string; reason?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'wallet' });

  return {
    title: `${t('title')} — Homesta Stay`,
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

export default async function WalletPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { topup } = await searchParams;

  // Signed in AND email-confirmed, enforced server-side. Redirects otherwise.
  // This runs before any query: the wallet read is scoped by the id it returns.
  const user = await requireConfirmedUser(locale, '/wallet');

  const t = await getTranslations({ locale, namespace: 'wallet' });
  const wallet = await getWalletView(user.id);

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="mx-auto max-w-2xl px-4 pt-12 pb-24 md:pt-16">
        <h1 className="text-[clamp(1.5rem,4vw,2.25rem)] font-medium tracking-[-0.035em] text-ink">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">{t('subtitle')}</p>

        {/* The banner is rendered from the query parameter, but the BALANCE
            below is read fresh from the ledger — so a 'success' banner never
            stands in for the figure. If the credit had not landed, the balance
            would say so and the banner would be the thing that was wrong. */}
        <TopupNotice locale={locale} topup={topup} />

        {!wallet.ok ? (
          // The read failed — a policy, a session, or the network. The guest
          // gets a service message and a way out; the cause is in the server
          // log, never on the screen.
          <div
            role="alert"
            className="mt-10 flex flex-col items-center gap-3 rounded-[14px] border border-rule px-6 py-14 text-center"
          >
            <p className="text-base font-medium text-ink">{t('errorTitle')}</p>
            <p className="max-w-xs text-sm leading-relaxed text-mute">{t('errorSubtitle')}</p>
          </div>
        ) : (
          <>
            <div className="mt-8">
              <WalletBalanceCard locale={locale} account={wallet.account} />
            </div>

            {/* The one primary action on this screen (Law 2). A closed wallet
                does not get it — offering a top-up on an account that cannot
                receive one is a dead end dressed as a button. */}
            {wallet.account?.status !== 'closed' && (
              <Link
                href="/wallet/top-up"
                className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[999px] bg-stay py-3.5 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t('topUpCta')}
              </Link>
            )}

            {wallet.account === null ? (
              // No wallet row yet. The balance card above already says $0.00,
              // so this explains WHY rather than repeating "nothing here".
              <div className="mt-10 flex flex-col items-center gap-3 rounded-[14px] border border-rule px-6 py-14 text-center">
                <p className="text-base font-medium text-ink">{t('noAccountTitle')}</p>
                <p className="max-w-xs text-sm leading-relaxed text-mute">
                  {t('noAccountSubtitle')}
                </p>
                <Link
                  href="/stays"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-[999px] border border-rule px-6 py-2.5 text-sm font-medium text-ink transition-colors duration-[240ms] hover:bg-paper-warm"
                >
                  {t('browseStays')}
                </Link>
              </div>
            ) : (
              <WalletEntryList
                locale={locale}
                entries={wallet.entries}
                truncated={wallet.truncated}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
