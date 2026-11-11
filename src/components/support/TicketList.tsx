'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { subscribeAsUser } from '@/lib/support/realtime';
import { fetchTickets } from '@/lib/support/client';
import type { SupportTicket } from '@/lib/support/model';
import { StatusChip, listTime } from './parts';
import { useMounted } from './useMounted';

const POLL_MS = 60_000;

/**
 * The guest's requests. Rendered on the server for the first paint; kept fresh
 * here by realtime on their support_tickets rows (a signal to refetch), a 60 s
 * poll while visible, and on returning to the tab.
 */
export function TicketList({
  userId,
  initial,
  categoryNames,
}: {
  userId: string;
  initial: SupportTicket[];
  categoryNames: Record<string, string>;
}) {
  const t = useTranslations('support');
  const locale = useLocale();
  const [tickets, setTickets] = useState(initial);
  const mounted = useMounted();

  const refresh = useCallback(async () => {
    const next = await fetchTickets();
    if (next) setTickets(next);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAsUser(`support-list-${userId}`, (ch) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `requester_profile_id=eq.${userId}` }, () => void refresh()),
    );
    const poll = setInterval(() => document.visibilityState === 'visible' && void refresh(), POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, refresh]);

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center text-center border border-rule rounded-[14px] px-6 py-14">
        <p className="text-base font-medium text-ink">{t('empty.title')}</p>
        <p className="mt-2 max-w-sm text-sm text-ink-soft leading-relaxed">{t('empty.body')}</p>
      </div>
    );
  }

  return (
    <ul className="border border-rule rounded-[14px] divide-y divide-rule overflow-hidden bg-white">
      {tickets.map((tk) => {
        const unread = tk.unread > 0;
        const name = (tk.categoryKey && categoryNames[tk.categoryKey]) || t('untitled');
        return (
          <li key={tk.id}>
            <Link
              href={`/account/support/${tk.id}`}
              className="group flex items-center gap-3 px-4 py-4 sm:px-5 transition-colors duration-[240ms] hover:bg-paper-warm/60 focus-visible:bg-paper-warm focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={cn('truncate text-[15px] text-ink', unread ? 'font-semibold' : 'font-medium')}>{name}</span>
                  <span className={cn('shrink-0 text-xs tabular-nums', unread ? 'font-medium text-ink' : 'text-mute')} >
                    {mounted ? listTime(tk.lastMessageAt ?? tk.createdAt, locale) : '\u00a0'}
                  </span>
                </span>
                <span className="mt-1 flex items-center justify-between gap-3">
                  {/* <bdi>: the preview may be in another script than the page. */}
                  <span className={cn('truncate text-sm', unread ? 'text-ink' : 'text-ink-soft')}>
                    <bdi>{tk.preview ?? t('noPreview')}</bdi>
                  </span>
                  {unread && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-stay px-1.5 text-[11px] font-semibold text-white tabular-nums">
                      <span aria-hidden="true">{tk.unread > 9 ? '9+' : tk.unread}</span>
                      <span className="sr-only">{t('unread', { count: tk.unread })}</span>
                    </span>
                  )}
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <StatusChip ticket={tk} />
                  {tk.reference && (
                    <span className="truncate font-mono text-[11px] uppercase tracking-[0.06em] text-mute">
                      <bdi>{tk.reference}</bdi>
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-mute rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
