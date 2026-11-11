'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowUp, CheckCircle2, Loader2, RotateCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { subscribeAsUser } from '@/lib/support/realtime';
import { fetchMessages, fetchTicket, markSolved, markSupportRead, rateTicket, sendWithFiles } from '@/lib/support/client';
import { refreshSupportUnread } from '@/lib/support/unread';
import {
  canRate,
  canSolve,
  canWrite,
  newRequestHref,
  replyEta,
  ticketState,
  type SupportError,
  type SupportMessage,
  type SupportTicket,
} from '@/lib/support/model';
import { AttachButton, AttachmentGrid, PendingFiles, useFilePicker, useSignedUrls } from './Attachments';
import { OUTLINE_PILL, PRIMARY_PILL, StatusChip, SupportAvatar } from './parts';
import { useMounted } from './useMounted';

const POLL_MS = 30_000;

/**
 * One request as a chat: header (category, status, reference, "Solved"),
 * the conversation, the reply-time notice, the rating card, the composer —
 * or, once closed, the way to a new request.
 *
 * Live by realtime (a new support_messages row for this ticket, a change to
 * its support_tickets row — each a signal to refetch, so RLS decides what
 * arrives), with a 30 s poll as the fallback. Read receipts: support_mark_read
 * on open and on every new message while the tab is visible.
 */
export function TicketChat({
  initialTicket,
  initialMessages,
  categoryName,
  bookingReference,
  justSent,
  filesFailed,
}: {
  initialTicket: SupportTicket;
  initialMessages: SupportMessage[];
  categoryName: string;
  bookingReference: string | null;
  justSent: boolean;
  filesFailed: boolean;
}) {
  const t = useTranslations('support');
  const locale = useLocale();
  const ticketId = initialTicket.id;
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState(initialMessages);
  const [solving, setSolving] = useState(false);
  const [notice, setNotice] = useState<SupportError | null>(filesFailed ? 'upload_failed' : null);
  const [announce, setAnnounce] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const seen = useRef(new Set(initialMessages.map((m) => m.id)));

  // ── Loading ──────────────────────────────────────────────────────────────
  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    void markSupportRead(ticketId).then(() => refreshSupportUnread());
  }, [ticketId]);

  const loadTicket = useCallback(async () => {
    const tk = await fetchTicket(ticketId);
    if (tk && tk !== 'missing') setTicket(tk);
  }, [ticketId]);

  const loadMessages = useCallback(async () => {
    const next = await fetchMessages(ticketId);
    if (!next) return;
    // A reply from support that this view has not shown yet → say so to
    // screen readers (the visible list itself is not a live region, so the
    // guest's own messages and the first load are not read out).
    const fresh = next.filter((m) => !seen.current.has(m.id));
    fresh.forEach((m) => seen.current.add(m.id));
    const reply = [...fresh].reverse().find((m) => m.side === 'staff');
    if (reply) setAnnounce(`${t('chat.newMessage')}: ${reply.body || t('chat.files', { count: reply.attachments.length })}`);
    setMessages((cur) => [...next, ...cur.filter((m) => m.local)]);
  }, [ticketId, t]);

  // The subscription reads the loaders through a ref, so it depends on the
  // ticket alone and is never torn down and rebuilt by a re-render.
  const loaders = useRef({ markRead, loadTicket, loadMessages });
  loaders.current = { markRead, loadTicket, loadMessages };

  useEffect(() => {
    const l = () => loaders.current;
    l().markRead();
    // As the guest, on a fresh topic — see lib/support/realtime for why both matter.
    const unsubscribe = subscribeAsUser(`support-ticket-${ticketId}`, (ch) =>
      ch
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticketId}` }, () => {
          stick.current = true;
          void l().loadMessages().then(() => l().markRead());
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` }, () => void l().loadTicket()),
    );
    const refreshAll = () => {
      if (document.visibilityState !== 'visible') return;
      void Promise.all([l().loadTicket(), l().loadMessages()]).then(() => l().markRead());
    };
    const poll = setInterval(refreshAll, POLL_MS);
    document.addEventListener('visibilitychange', refreshAll);
    return () => {
      unsubscribe();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', refreshAll);
    };
  }, [ticketId]);

  // Pinned to the newest message, unless the guest scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, ticket.status, ticket.rating]);

  // ── Sending ──────────────────────────────────────────────────────────────
  const send = useCallback(
    async (body: string, files: File[], retryId?: string) => {
      const id = retryId ?? `tmp-${crypto.randomUUID()}`;
      const optimistic: SupportMessage = { id, side: 'me', body, attachments: [], createdAt: new Date().toISOString(), local: 'sending', files };
      stick.current = true;
      setNotice(null);
      setMessages((cur) => [...cur.filter((m) => m.id !== id), optimistic]);
      const res = await sendWithFiles(ticketId, body, files);
      if (!res.ok) {
        setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, local: 'failed' } : m)));
        setNotice(res.error);
        if (res.error === 'ticket_closed') void loadTicket();
        return;
      }
      setMessages((cur) => cur.filter((m) => m.id !== id));
      // Writing on a solved request reopens it — read the row again.
      await Promise.all([loadMessages(), loadTicket()]);
    },
    [ticketId, loadMessages, loadTicket],
  );

  async function solve() {
    setSolving(true);
    const res = await markSolved(ticketId);
    setSolving(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    stick.current = true;
    await Promise.all([loadTicket(), loadMessages()]);
  }

  const state = ticketState(ticket);
  const eta = replyEta(ticket);
  const writable = canWrite(ticket);
  // The database posts its own system note when a request is solved — in
  // English only (2026-11-11). In English the site's sentence would repeat
  // it, so it is dropped; in any other language it is the guest's only
  // version of that note, so it stays.
  const resolvedAt = ticket.resolvedAt ? Date.parse(ticket.resolvedAt) : NaN;
  const systemNoted =
    locale === 'en' && Number.isFinite(resolvedAt) && messages.some((m) => m.side === 'system' && Date.parse(m.createdAt) >= resolvedAt - 5_000);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-rule px-4 py-3">
        <Link
          href="/account/support"
          aria-label={t('back')}
          className="-ms-2 inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper-warm transition-colors duration-[240ms]"
        >
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-medium tracking-[-0.02em] text-ink">{categoryName}</h1>
          <p className="mt-0.5 flex min-w-0 items-center gap-2">
            <StatusChip ticket={ticket} />
            {ticket.reference && (
              <span className="truncate font-mono text-[11px] uppercase tracking-[0.06em] text-mute">
                <span className="sr-only">{t('chat.reference')}: </span>
                <bdi>{ticket.reference}</bdi>
              </span>
            )}
          </p>
        </div>
        {canSolve(ticket) && (
          <button type="button" onClick={() => void solve()} disabled={solving} className={cn(OUTLINE_PILL, 'min-h-[40px] px-3.5')}>
            {solving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{t('chat.solved')}</span>
            <span className="sm:hidden">{t('chat.solvedShort')}</span>
          </button>
        )}
      </header>

      {/* Conversation */}
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {bookingReference && (
          <p className="mb-4 text-center">
            <span className="inline-block rounded-full bg-paper-warm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] rtl:tracking-normal text-ink-soft">
              <bdi>{t('chat.booking', { reference: bookingReference })}</bdi>
            </span>
          </p>
        )}

        <MessageList messages={messages} onRetry={(m) => void send(m.body, m.files ?? [], m.id)} />

        {justSent && eta && state !== 'solved' && (
          <p className="mx-auto mt-5 max-w-sm text-center text-sm font-medium text-ink">{t('chat.sent')}</p>
        )}
        {eta && (
          <p role="status" className="mx-auto mt-2 max-w-sm rounded-full border border-rule px-4 py-2 text-center text-xs text-ink-soft">
            {eta.unit === 'soon' ? t('chat.etaSoon') : t(`chat.eta.${eta.unit}`, { count: eta.value })}
          </p>
        )}
        {state === 'solved' && !(writable && systemNoted) && (
          <p className="mx-auto mt-5 max-w-sm text-center text-xs leading-relaxed text-mute">
            {writable ? t('chat.solvedNotice') : t('chat.solvedExpired')}
          </p>
        )}
        {canRate(ticket) && <RatingCard ticketId={ticketId} onRated={() => void loadTicket()} />}
        {ticket.rating != null && (
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-mute">
            {ticket.rating > 0 ? <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />}
            {t('rate.thanks')}
          </p>
        )}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {notice && (
        <p role="alert" className="border-t border-rule bg-white px-4 py-2 text-center text-sm text-ink">
          {t(`errors.${notice}`)}
        </p>
      )}

      {/* Composer — or, once it can no longer take replies, the way to a new request */}
      {writable ? (
        <Composer onSend={(b, f) => void send(b, f)} />
      ) : (
        <div className="border-t border-rule px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center">
          <p className="text-sm text-mute">{state === 'closed' ? t('chat.closed') : t('chat.solvedExpired')}</p>
          <Link href={newRequestHref({ category: ticket.categoryKey, booking: ticket.bookingId })} className={cn(PRIMARY_PILL, 'mt-3')}>
            {t('chat.openNew')}
          </Link>
        </div>
      )}
    </div>
  );
}

/** The calendar day of a timestamp — in UTC until mounted, so server and hydration agree. */
function dayKey(iso: string, local: boolean) {
  const d = new Date(iso);
  return local ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : iso.slice(0, 10);
}

function MessageList({ messages, onRetry }: { messages: SupportMessage[]; onRetry: (m: SupportMessage) => void }) {
  const t = useTranslations('support.chat');
  const locale = useLocale();
  const urls = useSignedUrls(messages.flatMap((m) => m.attachments.map((a) => a.path)));
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const mounted = useMounted();
  const now = new Date();
  const key = (iso: string) => dayKey(iso, mounted);
  const today = key(now.toISOString());
  const yesterday = key(new Date(now.getTime() - 86_400_000).toISOString());

  return (
    <ol className="flex flex-col gap-1.5">
      {messages.map((m, i) => {
        const day = key(m.createdAt);
        const newDay = i === 0 || key(messages[i - 1].createdAt) !== day;
        const sep = newDay && (
          <li className="flex justify-center py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] rtl:tracking-normal rtl:font-sans text-mute">
              {!mounted ? '\u00a0' : day === today ? t('today') : day === yesterday ? t('yesterday') : dayFmt.format(new Date(m.createdAt))}
            </span>
          </li>
        );

        if (m.side === 'system') {
          return (
            <Fragment key={m.id}>
              {sep}
              <li className="px-6 py-2 text-center">
                <p dir="auto" className="text-xs leading-relaxed text-mute">{m.body}</p>
              </li>
            </Fragment>
          );
        }

        const mine = m.side === 'me';
        const sameAsPrev = !newDay && i > 0 && messages[i - 1].side === m.side;
        return (
          <Fragment key={m.id}>
            {sep}
            <li className={cn('flex gap-2', mine ? 'justify-end' : 'justify-start', !sameAsPrev && i > 0 && 'mt-2')}>
              {!mine && <span className="mt-auto w-8 shrink-0">{!sameAsPrev && <SupportAvatar size={32} />}</span>}
              <div className={cn('flex max-w-[82%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start', m.local === 'sending' && 'opacity-70')}>
                {!mine && !sameAsPrev && <p className="mb-1 ps-1 text-[11px] font-medium text-mute">{t('staff')}</p>}
                <span className="sr-only">{mine ? t('you') : t('staff')}: </span>
                {m.body.trim() && (
                  // dir="auto": each message lays out in its own script.
                  <div
                    dir="auto"
                    className={cn(
                      'whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-start text-[15px] leading-snug',
                      mine ? 'rounded-ee-[6px] bg-ink text-white' : 'rounded-es-[6px] bg-paper-warm text-ink',
                    )}
                  >
                    {m.body}
                  </div>
                )}
                {m.local && m.files?.length ? (
                  <p className="mt-1 rounded-[12px] border border-rule px-3 py-1.5 text-xs text-ink-soft">{t('files', { count: m.files.length })}</p>
                ) : (
                  <AttachmentGrid attachments={m.attachments} urls={urls} mine={mine} />
                )}
                <span className="mt-0.5 px-1 text-[11px] text-mute tabular-nums">
                  {m.local === 'sending' ? t('sending') : m.local === 'failed' ? t('failed') : mounted ? timeFmt.format(new Date(m.createdAt)) : '\u00a0'}
                </span>
                {m.local === 'failed' && (
                  <button type="button" onClick={() => onRetry(m)} className="inline-flex min-h-[32px] items-center gap-1 px-1 text-xs font-medium text-stay">
                    <RotateCw className="w-3 h-3" aria-hidden="true" />
                    {t('retry')}
                  </button>
                )}
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function Composer({ onSend }: { onSend: (body: string, files: File[]) => void }) {
  const t = useTranslations('support');
  const [text, setText] = useState('');
  const { files, problem, add, remove, clear } = useFilePicker();
  const can = text.trim().length > 0 || files.length > 0;

  const submit = () => {
    if (!can) return;
    onSend(text.trim(), files);
    setText('');
    clear();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on a keyboard; Shift+Enter (and IME composition) does not.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-rule bg-white px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {files.length > 0 && (
        <div className="mb-2">
          <PendingFiles files={files} onRemove={remove} />
        </div>
      )}
      {problem && (
        <p role="alert" className="mb-2 px-1 text-xs text-ink">
          {problem}
        </p>
      )}
      <div className="flex items-end gap-2">
        <AttachButton onPick={add} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          dir="auto"
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-[22px] border border-rule bg-white px-4 py-2.5 text-base text-ink placeholder:text-mute focus:border-ink focus:outline-none [field-sizing:content]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!can}
          aria-label={t('chat.send')}
          className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-stay text-white transition-opacity duration-[240ms] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ArrowUp className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** After a request is solved: 👍 / 👎 and an optional comment, sent together (support_rate). */
function RatingCard({ ticketId, onRated }: { ticketId: string; onRated: () => void }) {
  const t = useTranslations('support.rate');
  const tErr = useTranslations('support.errors');
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SupportError | null>(null);

  async function submit() {
    if (rating == null) return;
    setBusy(true);
    const res = await rateTicket(ticketId, rating, comment.trim() || null);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onRated();
  }

  const thumb = (value: 1 | -1) => {
    const on = rating === value;
    const Icon = value > 0 ? ThumbsUp : ThumbsDown;
    return (
      <button
        type="button"
        onClick={() => setRating(value)}
        aria-pressed={on}
        className={cn(
          'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[999px] border text-sm font-medium transition-colors duration-[240ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
          on ? 'border-ink bg-ink text-white' : 'border-rule bg-white text-ink hover:bg-paper-warm',
        )}
      >
        <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
        {t(value > 0 ? 'yes' : 'no')}
      </button>
    );
  };

  return (
    <section className="mx-auto mt-5 max-w-sm rounded-[14px] border border-rule bg-white p-4" aria-labelledby={`rate-${ticketId}`}>
      <p id={`rate-${ticketId}`} className="text-center text-[15px] font-medium text-ink">
        {t('title')}
      </p>
      <p className="mt-0.5 text-center text-xs text-mute">{t('subtitle')}</p>
      <div className="mt-3 flex gap-2" role="group" aria-labelledby={`rate-${ticketId}`}>
        {thumb(1)}
        {thumb(-1)}
      </div>
      {rating != null && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={1000}
            dir="auto"
            placeholder={t('commentPh')}
            aria-label={t('comment')}
            className="mt-3 block w-full resize-none rounded-[12px] border border-rule bg-white px-3 py-2 text-base text-ink placeholder:text-mute focus:border-ink focus:outline-none sm:text-sm"
          />
          {error && (
            <p role="alert" className="mt-2 text-xs text-ink">
              {tErr(error)}
            </p>
          )}
          <button type="button" onClick={() => void submit()} disabled={busy} className={cn(PRIMARY_PILL, 'mt-3 w-full')}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {t('send')}
          </button>
        </>
      )}
    </section>
  );
}
