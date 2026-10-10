'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthUser } from '@/hooks/useAuthUser';
import { track } from '@/lib/analytics/events';

/**
 * Saved places (the ❤ on every card).
 *
 *   signed out  → this browser's localStorage
 *   signed in   → public.customer_favorites (RLS: own rows only); whatever
 *                 was saved while signed out is merged into the account on
 *                 sign-in and the local copy cleared
 *
 * Until the table exists (supabase/pending/20261010_search_v2_favorites_events
 * .sql) the first read fails and everyone simply keeps the local list — the
 * heart still works and nothing saved is lost; the merge happens on the first
 * sign-in after the table appears.
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
  /** False until the saved list has been read (avoids a flash of empty hearts being trusted). */
  ready: boolean;
}

const FavoritesContext = createContext<FavoritesValue>({ ids: [], has: () => false, toggle: () => {}, ready: false });

export function useFavorites(): FavoritesValue {
  return useContext(FavoritesContext);
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  const [ids, setIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'local' | 'db'>('local');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (user === undefined) return; // auth still loading
    if (user === null) {
      setMode('local');
      setIds(readLocal());
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customer_favorites')
        .select('unit_id')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        // Table not there yet (or unreadable): keep saving in this browser.
        setMode('local');
        setIds(readLocal());
        setReady(true);
        return;
      }

      const saved = (data ?? []).map((r) => r.unit_id as string);
      const local = readLocal().filter((id) => !saved.includes(id));
      if (local.length) {
        const { error: mergeError } = await supabase
          .from('customer_favorites')
          .upsert(local.map((unit_id) => ({ profile_id: user.id, unit_id })), { onConflict: 'profile_id,unit_id', ignoreDuplicates: true });
        if (!mergeError) writeLocal([]);
        if (cancelled) return;
        setIds(mergeError ? saved : [...local, ...saved]);
      } else {
        writeLocal([]);
        setIds(saved);
      }
      setMode('db');
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const toggle = useCallback((unitId: string) => {
    if (!UUID.test(unitId)) return;
    const on = !ids.includes(unitId);
    const next = on ? [unitId, ...ids] : ids.filter((id) => id !== unitId);
    setIds(next); // optimistic
    track({ event: 'favorite', unit_id: unitId, filters: { on } });

    if (mode === 'local' || !user) {
      writeLocal(next);
      return;
    }
    const supabase = createClient();
    const op = on
      ? supabase.from('customer_favorites').insert({ profile_id: user.id, unit_id: unitId })
      : supabase.from('customer_favorites').delete().eq('profile_id', user.id).eq('unit_id', unitId);
    void Promise.resolve(op).then(({ error }) => {
      // 23505: already saved (another tab) — the heart is right as it is.
      if (error && error.code !== '23505') setIds(ids);
    });
  }, [ids, mode, user]);

  const value = useMemo<FavoritesValue>(() => {
    const set = new Set(ids);
    return { ids, has: (id) => set.has(id), toggle, ready };
  }, [ids, toggle, ready]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
