import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';
import { getTransferOptions, listMyTransfers } from '@/lib/transfers/server';
import { formatIstanbul, formatMoney, localName, statusKey } from '@/lib/transfers/model';

/** My transfers — my_transfers() as the user. */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MyTransfersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireConfirmedUser(locale, '/account/transfers');
  const [t, tStatus, list, options] = await Promise.all([
    getTranslations({ locale, namespace: 'transfers.account' }),
    getTranslations({ locale, namespace: 'transfers.status' }),
    createClient().then(listMyTransfers),
    getTransferOptions().catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-xl px-4 pt-24 pb-20">
        <h1 className="mb-6 text-[clamp(1.6rem,5vw,2.1rem)] font-medium tracking-[-0.035em] text-ink">{t('title')}</h1>
        {list === null && <p role="alert" className="text-ink-soft">{t('loadError')}</p>}
        {list && list.length === 0 && (
          <div className="rounded-[14px] border border-rule bg-white p-6 text-center">
            <p className="mb-4 text-ink-soft">{t('empty')}</p>
            <Link href="/transfers" className="inline-flex min-h-12 items-center rounded-[999px] bg-stay px-8 font-medium text-white">{t('book')}</Link>
          </div>
        )}
        {list && list.length > 0 && (
          <ul className="flex flex-col gap-3">
            {list.map((x) => {
              const a = options?.airports.find((o) => o.code === x.airport);
              const airport = a ? localName(a, locale, x.airport ?? '') : x.airport ?? '';
              const route = x.direction === 'departure' ? `${x.district ?? ''} → ${airport}` : `${airport} → ${x.district ?? ''}`;
              return (
                <li key={x.id}>
                  <Link href={`/account/transfers/${x.id}`} className="flex items-center gap-3 rounded-[14px] border border-rule bg-white p-4 hover:bg-paper-warm">
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-medium text-ink">{route}</span>
                      <span className="text-sm text-ink-soft">{formatIstanbul(x.pickupAt, locale)}</span>
                      <span className="text-xs text-mute">
                        {tStatus.has(statusKey(x.status)) ? tStatus(statusKey(x.status)) : x.status}
                        {x.reference ? ` · ${x.reference}` : ''}
                        {x.priceUsd !== null ? ` · ${formatMoney(x.priceUsd, 'USD', locale)}` : ''}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-mute rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
