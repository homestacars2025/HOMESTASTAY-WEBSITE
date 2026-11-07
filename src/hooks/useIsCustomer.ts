'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * The signed-in account's kind, as far as the menus need it — read from the
 * user's own profiles row (RLS: own row only).
 *
 *   customer  a guest
 *   owner     a host: books like a guest with the same account (decision
 *             2026-11-07) and also gets a link to the host portal
 *   other     staff or a blocked account — no guest area
 *
 * null while unknown, and the menu links stay hidden until it is known: a
 * link that flashes and disappears would be worse than one that appears. The
 * pages themselves are guarded server-side either way (usesGuestArea).
 */
export type ClientAccountKind = 'customer' | 'owner' | 'other';

export function useAccountKind(user: User | null | undefined): ClientAccountKind | null {
  const [kind, setKind] = useState<ClientAccountKind | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) { setKind(null); return; }
    let cancelled = false;
    createClient()
      .from('profiles')
      .select('role, status')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // Same rule as accountKind(): a missing row or the column default is a
        // guest; any non-'active' status is not.
        if (error) { setKind(null); return; }
        const role = data?.role ?? null;
        const status = data?.status ?? null;
        if (status != null && status !== 'active') setKind('other');
        else if (role === 'owner') setKind('owner');
        else if (role === 'team' || role === 'admin') setKind('other');
        else setKind('customer');
      });
    return () => { cancelled = true; };
  }, [userId]);

  return kind;
}

/** Whether the account may use the guest area (My bookings, Wallet, Saved): guests and hosts. */
export function useIsCustomer(user: User | null | undefined): boolean | null {
  const kind = useAccountKind(user);
  return kind === null ? null : kind !== 'other';
}
