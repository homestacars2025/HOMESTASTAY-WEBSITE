'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { cancelTransferAction } from '@/app/[locale]/account/transfers/actions';

/** Cancel, with a confirm step and an optional reason. The database decides the refund. */
export function CancelTransfer({ transferId, free }: { transferId: string; free: boolean }) {
  const t = useTranslations('transfers.account');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      const r = await cancelTransferAction(transferId, reason).catch(() => ({ status: 'error' as const }));
      if (r.status === 'ok') {
        setMessage(t(r.refund ? 'cancelledRefund' : 'cancelled'));
        setOpen(false);
        router.refresh();
        return;
      }
      if (r.status === 'too_late') { setMessage(t('tooLate', { hours: r.freeCancelHours ?? 24 })); return; }
      setMessage(t(r.status === 'not_cancellable' ? 'notCancellable' : 'cancelError'));
    });
  }

  return (
    <div className="mt-6">
      {!open ? (
        <button type="button" onClick={() => { setMessage(''); setOpen(true); }}
          className="inline-flex min-h-11 items-center rounded-[999px] border border-rule px-6 text-sm font-medium text-ink hover:bg-paper-warm">
          {t('cancel')}
        </button>
      ) : (
        <div className="rounded-[14px] border border-rule bg-white p-4">
          <p className="mb-3 text-sm text-ink-soft">{t(free ? 'cancelFree' : 'cancelNotFree')}</p>
          <label htmlFor="cancel-reason" className="mb-2 block text-sm text-mute">{t('reason')}</label>
          <textarea id="cancel-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
            className="mb-3 min-h-20 w-full rounded-[14px] border border-rule px-4 py-3 text-[15px] focus:border-ink focus:outline-none" />
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={confirm}
              className="inline-flex min-h-11 items-center rounded-[999px] bg-ink px-6 text-sm font-medium text-white disabled:opacity-60">
              {t('confirmCancel')}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center px-3 text-sm text-ink-soft">
              {t('keep')}
            </button>
          </div>
        </div>
      )}
      {message && <p role="status" className="mt-3 text-sm text-ink">{message}</p>}
    </div>
  );
}
