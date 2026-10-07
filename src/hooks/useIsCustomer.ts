'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Whether the signed-in account is a guest — the only accounts the customer
 * area (My bookings, Wallet) is for. Reads the user's own profiles row (RLS:
 * own row only).
 *
 * null while unknown, and the menu links stay hidden until it is known: a
 * host or staff session should not normally be on this site at all (sign-in
 * hands them off), so this is the belt to /api/auth/continue's braces, and a
 * link that flashes and disappears would be worse than one that appears.
 * The pages themselves are guarded server-side either way.
 */
export function useIsCustomer(user: User | null | undefined): boolean | null {
  const [isCustomer, setIsCustomer] = useState<boolean | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) { setIsCustomer(null); return; }
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
        if (error) { setIsCustomer(null); return; }
        const role = data?.role ?? null;
        const status = data?.status ?? null;
        setIsCustomer(
          (status == null || status === 'active') &&
          role !== 'owner' && role !== 'team' && role !== 'admin',
        );
      });
    return () => { cancelled = true; };
  }, [userId]);

  return isCustomer;
}
