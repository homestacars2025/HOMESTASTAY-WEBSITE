'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useIsCustomer } from '@/hooks/useIsCustomer';
import { track } from '@/lib/analytics/events';

/**
 * Saved places (the ❤ on every card).
 *
 *   signed out, or a host / staff account
 *               → this browser's localStorage only
 *   a customer  → public.customer_favorites (RLS: own rows; profile_id is set
 *                 by the database, never sent from here). The app writes the
 *                 same table, so the list is re-read on every sign-in and
 *                 whenever the Saved page opens — a heart added in the app
 *                 shows here.
 *
 * On a customer's sign-in, whatever was saved in this browser is merged into
 * the account with ONE call (merge_favorites — skips duplicates and units
 * that no longer exist); the local copy is cleared only once that call has
 * succeeded, so a failure never loses a saved place.
 *
 * The account's list is read here, client-side, on purpose: it depends on the
 * browser's own session and on localStorage, which no server render can see.
 */

const KEY = 'hs_favorites';
const MAX_LOCAL = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readLocal(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, MAX_LOCAL) : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: string[]): void {
  try {
    if (ids.length) window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_LOCAL)));
    else window.localStorage.removeItem(KEY);
  } catch { /* storage blocked — the heart still works for this page */ }
}

interface FavoritesValue {
  /** Saved unit ids, newest first. */
  ids: string[];
  has: (unitId: string) => boolean;
  toggle: (unitId: string) => void;
  /** Re-read the saved list (the Saved page calls this when it opens). */
  refresh: () => void;
  /** False until the saved list has been read. */
  ready: boolean;
}

const FavoritesContext = createContext<FavoritesValue>({
  ids: [], has: () => false, toggle: () => {}, refresh: () => {}, ready: false,
});

export function useFavorites(): FavoritesValue {
  return useContext(FavoritesContext);
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  const isCustomer = useIsCustomer(user);
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  // Where the list lives. Undecided while auth or the role is still loading.
  const mode: 'local' | 'account' | null =
    user === undefined ? null
      : user === null ? 'local'
        : isCustomer === null ? null
          : isCustomer ? 'account' : 'local';

  const loading = useRef(0);

  /** The account's saved list, newest first. Null when it could not be read. */
  const readAccount = useCallback(async (): Promise<string[] | null> => {
    const { data, error } = await createClient()
      .from('customer_favorites')
      .select('unit_id')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[favorites] read failed', { code: error.code });
      return null;
    }
    return (data ?? []).map((r) => r.unit_id as string);
  }, []);

  const refresh = useCallback(() => {
    if (mode === 'local') { setIds(readLocal()); setReady(true); return; }
    if (mode !== 'account') return;
    const run = ++loading.current;
    void readAccount().then((saved) => {
      if (run !== loading.current || saved === null) return;
      // Anything still local (a merge that failed) stays visible too.
      const local = readLocal().filter((id) => !saved.includes(id));
      setIds([...local, ...saved]);
      setReady(true);
    });
  }, [mode, readAccount]);

  // Sign-in (or the role becoming known): merge the browser's list once, then read.
  useEffect(() => {
    if (mode === null) return;
    if (mode === 'local') { setIds(readLocal()); setReady(true); return; }

    let cancelled = false;
    const run = ++loading.current;
    (async () => {
      const local = readLocal();
      if (local.length) {
        const { error } = await createClient().rpc('merge_favorites', { p_unit_ids: local });
        if (!error) writeLocal([]);
        else console.warn('[favorites] merge failed — kept in this browser', { code: error.code });
      }
      const saved = await readAccount();
      if (cancelled || run !== loading.current) return;
      const stillLocal = readLocal().filter((id) => !(saved ?? []).includes(id));
      setIds([...stillLocal, ...(saved ?? [])]);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [mode, user?.id, readAccount]);

  const toggle = useCallback((unitId: string) => {
    if (!UUID.test(unitId)) return;
    const on = !ids.includes(unitId);
    const next = on ? [unitId, ...ids] : ids.filter((id) => id !== unitId);
    setIds(next); // optimistic
    track({ event: 'favorite', unit_id: unitId, filters: { on } });

    if (mode !== 'account') {
      writeLocal(next);
      return;
    }
    const supabase = createClient();
    // profile_id is NOT sent: the database fills it with auth.uid().
    const op = on
      ? supabase.from('customer_favorites').insert({ unit_id: unitId })
      : supabase.from('customer_favorites').delete().eq('unit_id', unitId);
    void Promise.resolve(op).then(({ error }) => {
      // 23505: already saved (the app, another tab) — the heart is right as it is.
      if (error && error.code !== '23505') {
        console.warn('[favorites] save failed', { code: error.code });
        setIds(ids);
      }
    });
  }, [ids, mode]);

  const value = useMemo<FavoritesValue>(() => {
    const set = new Set(ids);
    return { ids, has: (id) => set.has(id), toggle, refresh, ready };
  }, [ids, toggle, refresh, ready]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
