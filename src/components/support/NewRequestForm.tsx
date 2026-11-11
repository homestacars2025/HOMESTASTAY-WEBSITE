'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { openTicket, sendWithFiles } from '@/lib/support/client';
import { refreshSupportUnread } from '@/lib/support/unread';
import type { SupportError, SupportPrefill } from '@/lib/support/model';
import type { BookingOption } from '@/lib/support/server';
import { AttachButton, PendingFiles, useFilePicker } from './Attachments';
import { PRIMARY_PILL } from './parts';

const MAX_BODY = 4000;

/**
 * New request: what it is about → (optional) which booking → message + files
 * → Send.
 *
 * The ticket is opened with its TEXT first (support_open_ticket): the files'
 * storage path needs the ticket id, so they follow as the next message. If the
 * files then fail, the request itself is already in — the guest is told and
 * sent to the chat, where they can attach them again.
 */
export function NewRequestForm({
  categories,
  bookings,
  prefill,
}: {
  categories: { key: string; label: string }[];
  bookings: BookingOption[];
  prefill: SupportPrefill;
}) {
  const t = useTranslations('support');
  const locale = useLocale();
  const router = useRouter();
  const ids = useId();

  const [category, setCategory] = useState<string | null>(prefill.category);
  const [bookingId, setBookingId] = useState<string | null>(
    prefill.bookingId && bookings.some((b) => b.id === prefill.bookingId) ? prefill.bookingId : null,
  );
  const [body, setBody] = useState('');
  const { files, problem, add, remove } = useFilePicker();
  const [phase, setPhase] = useState<'idle' | 'opening' | 'uploading'>('idle');
  const [error, setError] = useState<SupportError | null>(null);
  const busy = phase !== 'idle';

  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmt = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
  };

  async function submit() {
    if (busy) return;
    if (!category) return setError('invalid_category');
    if (!body.trim()) return setError('message_required');
    setError(null);
    setPhase('opening');

    const res = await openTicket({ category, body: body.trim(), bookingId, language: locale });
    if (!res.ok) {
      setPhase('idle');
      setError(res.error);
      // The chosen booking is not on this account: drop it so a resend works.
      if (res.error === 'booking_not_yours') setBookingId(null);
      return;
    }

    let filesFailed = false;
    if (files.length) {
      setPhase('uploading');
      const sent = await sendWithFiles(res.value.id, '', files);
      filesFailed = !sent.ok;
    }
    void refreshSupportUnread();
    router.replace(`/account/support/${res.value.id}?sent=1${filesFailed ? '&files=failed' : ''}`);
  }

  const legend = 'text-[15px] font-medium text-ink';

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-8"
    >
      {/* 1 — what it is about */}
      <fieldset disabled={busy}>
        <legend className={legend}>{t('new.category')}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.key} className="relative">
              <input
                type="radio"
                name={`${ids}-category`}
                value={c.key}
                checked={category === c.key}
                onChange={() => {
                  setCategory(c.key);
                  if (error === 'invalid_category') setError(null);
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'inline-flex min-h-[44px] cursor-pointer items-center rounded-[999px] border px-4 text-sm transition-colors duration-[240ms]',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                  category === c.key ? 'border-ink bg-ink text-white' : 'border-rule bg-white text-ink hover:bg-paper-warm',
                )}
              >
                {c.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 2 — which booking (optional; only when the guest has any) */}
      {bookings.length > 0 && (
        <fieldset disabled={busy}>
          <legend className={legend}>
            {t('new.booking')} <span className="font-normal text-mute">({t('new.optional')})</span>
          </legend>
          <div className="mt-3 max-h-80 overflow-y-auto border border-rule rounded-[14px] divide-y divide-rule bg-white">
            {[null, ...bookings].map((b) => {
              const id = b?.id ?? null;
              const on = bookingId === id;
              return (
                <label
                  key={id ?? 'none'}
                  className={cn(
                    'flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-[240ms] hover:bg-paper-warm/60',
                    on && 'bg-paper-warm/60',
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-booking`}
                    checked={on}
                    onChange={() => setBookingId(id)}
                    className="h-[18px] w-[18px] shrink-0 accent-[#0E0E10]"
                  />
                  {b ? (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink"><bdi>{b.unitName ?? b.reference}</bdi></span>
                      <span className="block truncate text-xs text-mute">
                        <span className="tabular-nums">{[fmt(b.checkIn), fmt(b.checkOut)].filter(Boolean).join(' – ')}</span>
                        {b.reference && (
                          <>
                            {' · '}
                            <bdi className="font-mono uppercase tracking-[0.04em]">{b.reference}</bdi>
                          </>
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-ink">{t('new.noBooking')}</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* 3 — message + files */}
      <div>
        <label htmlFor={`${ids}-body`} className={legend}>
          {t('new.message')}
        </label>
        <textarea
          id={`${ids}-body`}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (error === 'message_required') setError(null);
          }}
          rows={6}
          maxLength={MAX_BODY}
          dir="auto"
          placeholder={t('new.placeholder')}
          disabled={busy}
          aria-invalid={error === 'message_required' || undefined}
          className="mt-3 block w-full resize-y rounded-[14px] border border-rule bg-white px-4 py-3 text-base text-ink placeholder:text-mute focus:border-ink focus:outline-none disabled:opacity-60"
        />
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <AttachButton onPick={add} disabled={busy} variant="text" />
          <PendingFiles files={files} onRemove={remove} disabled={busy} />
        </div>
        <p className="mt-2 text-xs text-mute">{t('files.hint')}</p>
        {problem && (
          <p role="alert" className="mt-2 text-sm text-ink">
            {problem}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-[14px] border border-stay/40 bg-white px-4 py-3 text-sm text-ink">
          <p>{t(`errors.${error}`)}</p>
          {(error === 'too_many_open_tickets' || error === 'ticket_closed') && (
            <Link href="/account/support" className="mt-1 inline-block font-medium underline underline-offset-4">
              {t('errors.seeRequests')}
            </Link>
          )}
          {error === 'not_signed_in' && (
            <Link href={`/sign-in?returnUrl=${encodeURIComponent('/account/support/new')}`} className="mt-1 inline-block font-medium underline underline-offset-4">
              {t('errors.signIn')}
            </Link>
          )}
        </div>
      )}

      {/* Mobile: the one primary action anchored to the bottom (Law 5). */}
      <div className="sticky bottom-0 -mx-4 border-t border-rule bg-paper/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-mute">{t('new.footnote')}</p>
          <button type="submit" disabled={busy} className={cn(PRIMARY_PILL, 'w-full sm:w-auto')}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {phase === 'opening' ? t('new.sending') : phase === 'uploading' ? t('new.uploading') : t('new.send')}
          </button>
        </div>
      </div>
    </form>
  );
}
