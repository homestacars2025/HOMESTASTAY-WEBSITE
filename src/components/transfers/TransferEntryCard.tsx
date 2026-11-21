import { getTranslations } from 'next-intl/server';
import { Plane } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/** "Need a ride from the airport?" — on a paid stay's confirmation, linking the transfer to that stay. */
export async function TransferEntryCard({ locale, stayBookingId }: { locale: string; stayBookingId: string }) {
  const t = await getTranslations({ locale, namespace: 'transfers.entry' });
  return (
    <div className="mb-4 flex items-start gap-3 rounded-[14px] border border-rule bg-paper-warm p-5">
      <Plane size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-medium text-ink">{t('title')}</p>
        <p className="text-sm text-ink-soft">{t('body')}</p>
        <Link href={`/transfers?stay=${stayBookingId}`} className="mt-2 inline-flex min-h-11 w-fit items-center rounded-[999px] bg-ink px-5 text-sm font-medium text-white">
          {t('cta')}
        </Link>
      </div>
    </div>
  );
}
