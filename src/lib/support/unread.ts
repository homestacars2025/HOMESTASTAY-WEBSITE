'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { subscribeAsUser } from './realtime';
import { fetchUnreadTotal } from './client';

/**
 * The header's Support badge: the sum of requester_unread over the guest's
 * requests.
 *
 * ONE store per tab, shared by the desktop menu and the mobile drawer (both
 * are mounted on every page): one query, one realtime channel, however many
 * badges read it. It starts only when a signed-in guest's header asks for it,
 * so anonymous traffic — nearly all of it — pays nothing.
 *
 * Fresh by: realtime on support_tickets for this requester (a signal to
 * refetch), a 60 s poll while the tab is visible (covers a table not in the
 * realtime publication), and on returning to the tab. The ticket page also
 * calls refreshSupportUnread() after marking a request read.
 */

const POLL_MS = 60_000;

let total = 0;
let started: string | null = null;
let stop: (() => void) | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
/** Mounted badges per user id. */
const users = new Map<string, number>();

const emit = () => listeners.forEach((l) => l());

export function refreshSupportUnread(): Promise<void> {
  inflight ??= fetchUnreadTotal()
    .then((n) => {
      if (n !== null && n !== total) {
        total = n;
        emit();
      }
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function start(userId: string) {
  if (started === userId) return;
  stop?.();
  started = userId;
  total = 0;
  emit();
  void refreshSupportUnread();

  const unsubscribe = subscribeAsUser(`support-unread-${userId}`, (ch) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `requester_profile_id=eq.${userId}` }, () => void refreshSupportUnread()),
  );
  const poll = setInterval(() => document.visibilityState === 'visible' && void refreshSupportUnread(), POLL_MS);
  const onVisible = () => document.visibilityState === 'visible' && void refreshSupportUnread();
  document.addEventListener('visibilitychange', onVisible);

  stop = () => {
    unsubscribe();
    clearInterval(poll);
    document.removeEventListener('visibilitychange', onVisible);
    started = null;
    stop = null;
  };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * The unread total for this signed-in guest; 0 while unknown or for anyone
 * else. Reference-counted: the store runs while at least one badge for this
 * user is mounted, and stops a tick after the last one goes (so a Strict Mode
 * re-run, or the menu and the drawer learning the account kind at different
 * moments, never tears the channel down and rebuilds it).
 */
export function useSupportUnread(userId: string | null): number {
  useEffect(() => {
    if (!userId) return;
    users.set(userId, (users.get(userId) ?? 0) + 1);
    start(userId);
    return () => {
      users.set(userId, (users.get(userId) ?? 1) - 1);
      setTimeout(() => {
        if ((users.get(userId) ?? 0) > 0 || started !== userId) return;
        users.delete(userId);
        stop?.();
        total = 0;
        emit();
      }, 0);
    };
  }, [userId]);
  return useSyncExternalStore(subscribe, () => (userId ? total : 0), () => 0);
}
